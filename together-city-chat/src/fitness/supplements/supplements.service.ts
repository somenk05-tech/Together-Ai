import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { MasterProfileService } from '../../profile/master-profile.service';
import { MedicalService } from '../../medical/medical.service';
import { NutritionService } from '../../nutrition/nutrition.service';
import { swallowed } from '../../shared/swallow';
import { recommend, type Citizen } from './supplements.engine';
import { BadRequestException } from '@nestjs/common';
import { FinancialService } from '../../financial/financial.service';
import { SOURCE, SUPPLEMENTS } from './knowledge';
import { AISLES, PRODUCTS, sellable, type Product } from './products';
import { normaliseBag, parseBag, priceBagForDisplay, priceSupplementOrder, type BagLine } from './supplements.bag';
import type { PlaceSupplementOrderDto } from '../dto/supplements.dto';

/**
 * WHAT THE ENGINE IS ALLOWED TO KNOW, AND WHERE IT COMES FROM.
 *
 * The engine itself is a pure function over a `Citizen` — no database, no
 * services, no clock — which is what makes it testable and what keeps the
 * safety rules readable. This file is the only place that talks to the hubs,
 * and it does three things worth naming.
 *
 * THE BLOOD WORK IS READ THROUGH THE CONSENT GATE, not out of the table.
 * `medical.sharedBiomarkers(userId, 'fitness')` is the reader that throws if
 * the citizen has revoked Fitness's access to their medical hub, and going
 * around it — a direct Prisma query for the same rows — would be a privacy
 * regression that no test in the medical hub could see. If consent is refused
 * the engine simply runs without labs, which it is built to do: the answers
 * become population-level and say so.
 *
 * EVERY READ IS SWALLOWED, and that is not laziness. A citizen with no
 * nutrition profile, no blood test and no medicines is the COMMON case on a
 * new account, and an engine that throws for them shows a broken screen
 * instead of the honest one — which is "here is what is generally true in
 * India, and here is what a test would settle."
 *
 * NOTHING IS SUBSTITUTED FOR MISSING DATA. No default weight, no assumed sex,
 * no "most people train three times a week". The whole iron rule rests on the
 * difference between a normal ferritin and no ferritin, and a default is how
 * that difference gets erased before anything reads it.
 */
@Injectable()
export class SupplementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterProfile: MasterProfileService,
    private readonly medical: MedicalService,
    private readonly nutrition: NutritionService,
    private readonly financial: FinancialService,
  ) {}

  async plan(userId: string) {
    const [master, shared, targets, meds, pref, fitness] = await Promise.all([
      this.masterProfile.get(userId).catch(swallowed('supplements.master', null)),
      this.medical.sharedBiomarkers(userId, 'fitness').catch(swallowed('supplements.biomarkers', null)),
      this.nutrition.targets(userId).catch(swallowed('supplements.targets', null)),
      // A dropped medicine is a plan that recommends something clashing with it.
      // unbounded: every medicine they take, because the engine checks each one
      // for interactions — this is arithmetic on the whole list, not a page of it.
      this.prisma.medicine.findMany({ where: { userId }, select: { name: true } })
        .catch(swallowed('supplements.medicines', [] as Array<{ name: string }>)),
      this.prisma.foodPref.findUnique({ where: { userId } }).catch(swallowed('supplements.pref', null)),
      this.prisma.fitnessProfile.findUnique({ where: { userId } }).catch(swallowed('supplements.fitness', null)),
    ]);

    const citizen: Citizen = {
      age: num(fitness?.age) ?? num(pick(master, 'food', 'age')),
      sex: sexOf(fitness?.sex ?? pick(master, 'dating', 'gender')),
      vegetarian: dietIsVeg(pref?.diet),
      vegan: String(pref?.diet ?? '').toLowerCase().includes('vegan'),
      goal: goalOf(fitness?.goal ?? pref?.goal),
      /* Sessions a week is not on the fitness profile — `level` and `mode` are
         what it holds — so the engine is told nothing rather than a number
         somebody guessed. Creatine's goal reason needs it, which is why
         creatine stays off the plan until the activity log can supply it. */
      trainsPerWeek: undefined,
      proteinTargetG: num(pick(targets, 'protein', 'g')) ?? num(pick(targets, 'proteinG')),
      proteinIntakeG: num(pick(targets, 'eaten', 'protein')),
      /* Conditions live on the FITNESS profile as a comma-separated string
         (the same list the nutrition clinical engine reads), so they are read
         from there rather than invented on the master profile. */
      conditions: listOf(fitness?.conditions) ?? listOf(pick(master, 'food', 'conditions')),
      medicines: meds.map((m) => m.name),
      taking: [],
      /* THE LAB NAMES ARE THE MEDICAL HUB'S KEYS, mapped once, here. The engine
         matches loosely on the NAME it is given, so this is the one place that
         has to know `vitd` means 25-OH vitamin D. */
      labs: labsFrom(shared),
    };

    const out = recommend(citizen);
    return {
      ...out,
      /* WHAT WAS ACTUALLY KNOWN, said out loud. A plan built without blood
         work and a plan built with it are different objects, and the screen
         has to be able to tell the citizen which one it is holding. */
      basis: {
        bloodWork: shared ? { takenOn: (shared as { takenOn?: string }).takenOn ?? null, granted: true } : null,
        medicines: (citizen.medicines ?? []).length,
        diet: citizen.vegan ? 'vegan' : citizen.vegetarian ? 'vegetarian' : null,
        goal: citizen.goal ?? null,
      },
    };
  }

  /**
   * THE STORE — the same 103 products for everybody, with the citizen's own
   * plan attached to each one.
   *
   * THE CATALOGUE IS NOT PERSONALISED AND THAT IS DELIBERATE. Every citizen
   * sees every product, including the twelve sitting under supplements this
   * engine refuses. Hiding a multivitamin from somebody who came looking for a
   * multivitamin does not stop them buying one; it stops them reading the 78
   * trials first, and sends them to a shop that will sell it without the
   * footnote. What IS personal is the badge on the card — `yours` — and the
   * refusal is the loudest badge on the shelf.
   *
   * IT REUSES `plan()` RATHER THAN RE-DERIVING. One engine run, one consent
   * check, one set of answers. A store that computed its own opinion of a
   * product would eventually disagree with the plan page about the same
   * bottle, and the citizen would have no way to know which screen was lying.
   *
   * IF THE PLAN FAILS THE SHELF STILL LOADS, with no badges. A store that
   * five-hundreds because a blood test could not be read is a store that
   * punishes the citizen for the hub being down; an unbadged catalogue is
   * honest — it is exactly what this city knows about them at that moment.
   */
  async store(userId: string) {
    const built = await this.plan(userId).catch(swallowed('supplements.store', null));
    const mine = new Map((built?.plan ?? []).map((r) => [r.id, r]));

    const items = PRODUCTS.map((p) => {
      const f = SUPPLEMENTS.find((s) => s.id === p.supplement);
      const r = mine.get(p.supplement);
      /* THE PHOTOGRAPH TRAVELS; THE DOOR DOES NOT. Two owner's calls on
         16 Aug, hours apart. First the retailer's photograph came back onto
         every card — the 15-Aug "nothing leaves the city" drop reversed,
         with the drawn pack standing behind every photo as the fallback for
         a hotlink that is slow or gone. Then "See the product" came OFF:
         this store buys the Beauty way — Add on the shelf, a bag bar at the
         foot, a checkout page where the wallet moves — and a shop with a
         door to a rival checkout is not a shop. So `image` rides the wire
         and `url` is deleted on it, where no screen can put it back by
         accident. `retailer` still travels as provenance: a name, not a
         door. */
      const listed: Omit<Product, 'url'> & { url?: string } = { ...p };
      delete listed.url;
      return {
        ...listed,
        sellable: sellable(p),
        supplementName: f?.name ?? p.supplement,
        grade: f?.grade ?? null,
        gradeFor: f?.gradeFor ?? null,
        typicalDose: f?.typicalDose ?? null,
        upperLimit: f?.upperLimit ?? null,
        formToBuy: f?.form ?? null,
        testFirst: Boolean(f?.testFirst),
        /* THE BADGE. Null means this city has no opinion about this bottle FOR
           THIS PERSON — which is different from approval, and the screen says
           so rather than leaving a blank where a tick would go. */
        yours: r
          ? {
              bucket: r.bucket,
              needsClinician: r.needsClinician,
              why: r.why[0]?.text ?? null,
              source: r.why[0]?.source ?? null,
            }
          : null,
      };
    });

    return {
      items,
      aisles: AISLES,
      source: SOURCE,
      /* Whether the badges mean anything on this response. False is the state
         where the plan could not be built at all, and the shelf must not
         render an absent refusal as a silent yes. */
      personalised: Boolean(built),
      basis: built?.basis ?? null,
    };
  }

  /* ══ THE TILL ══════════════════════════════════════════════════════════
     One bag per citizen, priced from the shelf, paid through the one city
     wallet — the same till thirteen other hubs use, so a bottle of D3 lands
     in the Financial hub's spending beside a restaurant bill instead of in a
     private ledger nobody audits.

     THE GROCERY CHECKOUT IS WHY THIS IS WRITTEN CAREFULLY. Nutrition once had
     a `placeOrder` that debited the wallet, wrote an order and created seven
     delivery rows — and nothing in the app rendered any of it, so a citizen
     paid and then had nowhere to see what they had bought. It was removed, and
     a spec now holds it removed. Every route below has a reader: the bag can
     be read, the order history can be read, and neither is written without the
     other existing first. */

  /** The bag, as it stands, priced. Nothing here charges anything. */
  async bag(userId: string) {
    const row = await this.prisma.supplementBag.findUnique({ where: { userId } })
      .catch(swallowed('supplements.bag.read', null));
    return priceBagForDisplay(parseBag(safeJson(row?.linesJson)));
  }

  /** Replace the bag wholesale. The client owns the arithmetic of adding and
   *  removing; the server owns what a bag is allowed to contain. */
  async saveBag(userId: string, lines: BagLine[]) {
    const bag = normaliseBag(lines);
    const json = JSON.stringify(bag);
    await this.prisma.supplementBag.upsert({
      where: { userId }, update: { linesJson: json }, create: { userId, linesJson: json },
    }).catch(swallowed('supplements.bag.write', null));
    return priceBagForDisplay(bag);
  }

  /**
   * PAY FOR IT.
   *
   * THE WALLET IS CHARGED WHAT THE SHELF SAYS, NOT WHAT THE REQUEST SAYS —
   * `priceSupplementOrder` reads every price off `products.ts` and the request
   * contributes an id and a quantity and nothing else.
   *
   * THE CHARGE AND THE RECORD ARE ONE TRANSACTION. `financial.paid` debits and
   * runs the write inside the same transaction, because a failure after the
   * debit is how somebody ends up paid-up with no order to show for it.
   *
   * AND A REFUSAL HAS TO HAVE BEEN READ. Twelve products here sit under
   * supplements this city's own evidence review refuses. They are buyable —
   * hiding them does not stop the purchase, it only moves it somewhere that
   * never showed anybody the trials — but the screen asks once, and this
   * checks that it did. A confirmation nothing verifies is decoration.
   */
  async placeOrder(userId: string, dto: PlaceSupplementOrderDto) {
    const priced = priceSupplementOrder(dto.items);
    if (!priced.ok) {
      const shelf = new Map(PRODUCTS.map((p) => [p.id, p]));
      const name = (id: string) => shelf.get(id)?.name ?? 'One of these';
      if (priced.prescriptionIds.length) {
        throw new BadRequestException(
          `${name(priced.prescriptionIds[0])} is prescription-only in India. It can’t go through this checkout — the Prescriptions hub is where that one starts.`,
        );
      }
      if (priced.unpricedIds.length) {
        throw new BadRequestException(
          `${name(priced.unpricedIds[0])} has no single recorded price — the review found a range or no stock, and this city won’t invent a number to charge you.`,
        );
      }
      throw new BadRequestException('Something in your bag is no longer on the shelf. Reload the store and try again.');
    }

    /* WHICH OF THESE DOES THIS CITY RECOMMEND AGAINST? Read from the plan, not
       from the request. If the plan cannot be built at all the gate opens
       rather than closes: refusing to sell somebody a tub of whey because
       their medical hub is briefly unreachable is a worse failure than one
       unacknowledged multivitamin. */
    const built = await this.plan(userId).catch(swallowed('supplements.checkout.plan', null));
    const refusedSupps = new Set(
      (built?.plan ?? []).filter((r) => r.bucket === 'not-recommended').map((r) => r.id),
    );
    const shelf = new Map(PRODUCTS.map((p) => [p.id, p]));
    const seen = new Set(dto.acknowledged ?? []);
    const unread = priced.lines
      .filter((l) => refusedSupps.has(shelf.get(l.id)?.supplement ?? '') && !seen.has(l.id));
    if (unread.length) {
      throw new BadRequestException(
        `Your plan recommends against ${unread.map((l) => l.name).join(', ')}. The store shows the trial that says so — read it, then confirm.`,
      );
    }

    const orderId = await this.financial.paid<string>(
      userId,
      { hub: 'Fitness', category: 'fitness', label: 'Supplement order', amountInr: priced.totalInr, method: dto.method },
      async (tx) => {
        const created = await tx.supplementOrder.create({
          data: { userId, itemsJson: JSON.stringify(priced.lines), totalInr: priced.totalInr, status: 'placed' },
        });
        return created.id;
      },
    );

    /* THE BAG IS EMPTIED BY THE ORDER, which is one of exactly two things
       allowed to empty it — the other is the citizen. Leaving it full after
       payment is how somebody buys the same four bottles twice. */
    await this.saveBag(userId, []);
    return { orderId, orders: await this.orders(userId), bag: await this.bag(userId) };
  }

  /** What has been bought, so that paying for something is never the last time
   *  a citizen sees it. */
  async orders(userId: string) {
    const rows = await this.prisma.supplementOrder.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: ORDER_HISTORY_CAP,
    }).catch(swallowed('supplements.orders', [] as Array<Record<string, unknown>>));
    return (rows as Array<{ id: string; totalInr: number; status: string; itemsJson: string; createdAt: Date }>)
      .map((o) => ({
        id: o.id, totalInr: o.totalInr, status: o.status,
        items: parseOrderItems(o.itemsJson),
        createdAt: o.createdAt.toISOString(),
      }));
  }
}

const ORDER_HISTORY_CAP = 40;

function safeJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

/** An order's lines as they were priced ON THE DAY. Deliberately NOT re-read
 *  off today's shelf: a receipt that changes when a price changes is not a
 *  receipt. */
function parseOrderItems(json: string): Array<{ id: string; name: string; brand?: string; priceInr: number; qty: number }> {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

/* ── the defensive readers ────────────────────────────────────────────────
   Every hub owns its own shape and changes it without asking this file, so
   nothing here indexes blindly: a missing field reads as "not known", which
   is a state the engine handles, rather than as a crash on somebody's
   supplement page. */
function pick(o: unknown, ...keys: string[]): unknown {
  let cur = o;
  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}
function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}
function listOf(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string' && v.trim()) return v.split(',').map((s) => s.trim()).filter(Boolean);
  return undefined;
}
function sexOf(v: unknown): Citizen['sex'] {
  const s = String(v ?? '').toLowerCase();
  return s.startsWith('m') ? 'male' : s.startsWith('f') ? 'female' : undefined;
}
function dietIsVeg(v: unknown): boolean | undefined {
  const s = String(v ?? '').toLowerCase();
  if (!s) return undefined;
  return s.includes('veg') || s.includes('jain');
}
function goalOf(v: unknown): Citizen['goal'] {
  const s = String(v ?? '').toLowerCase();
  if (s.includes('muscle') || s.includes('gain') || s.includes('strong')) return 'muscle';
  if (s.includes('lose') || s.includes('fat') || s.includes('cut')) return 'fatloss';
  if (s.includes('endur') || s.includes('run')) return 'endurance';
  if (s.includes('sleep')) return 'sleep';
  if (s.includes('recover')) return 'recovery';
  return s ? 'wellness' : undefined;
}
/**
 * THE MEDICAL HUB'S BIOMARKER KEYS → THE NAMES THE ENGINE MATCHES ON.
 *
 * ONLY MARKERS THAT CHANGE AN ANSWER ARE MAPPED. An unmapped marker is not a
 * marker this engine is entitled to reason about, and the list below is short
 * on purpose: seven keys out of the medical hub's several dozen. Reading a
 * result the engine has no cited rule for would mean either ignoring it — a
 * lie by omission on a screen headed "built from your blood work" — or
 * improvising one, which is the thing this whole subsystem exists to prevent.
 *
 * THE FOUR THAT WERE MISSING. The first version of this file mapped vitamin D,
 * B12 and ferritin and stopped. The owner's own panel carries none of those
 * three and four of these: haemoglobin, HbA1c, LDL and triglycerides. So the
 * page told him what is generally true of Indian adults while his actual
 * results sat one hub away, unread — which is the specific failure a
 * personalised page is supposed to be incapable of. Each of the four now has
 * a cut-off in `labs.ts` with the body that published it, and a rule in the
 * engine that either moves a bucket or says "this one is your doctor's".
 *
 * NOTHING IS CONVERTED HERE. The unit is passed through as the medical hub
 * stores it, and the engine compares against a cut-off in that same unit. A
 * conversion is arithmetic on a lab value, and there is exactly one rule in
 * this subsystem that has no exceptions.
 */
function labsFrom(shared: unknown): Citizen['labs'] {
  const values = pick(shared, 'values');
  if (!values || typeof values !== 'object') return [];
  const at = String(pick(shared, 'takenOn') ?? '') || undefined;
  const v = values as Record<string, unknown>;
  const out: NonNullable<Citizen['labs']> = [];
  const add = (key: string, name: string, unit: string) => {
    const n = num(v[key]);
    if (n !== undefined) out.push({ name, value: n, unit, at });
  };
  add('vitd', '25-OH vitamin D', 'ng/mL');
  add('b12', 'Vitamin B12', 'pg/mL');
  add('ferritin', 'Ferritin', 'ng/mL');
  add('hb', 'Haemoglobin', 'g/dL');
  add('hba1c', 'HbA1c', '%');
  add('ldl', 'LDL cholesterol', 'mg/dL');
  add('trig', 'Triglycerides', 'mg/dL');
  return out;
}
