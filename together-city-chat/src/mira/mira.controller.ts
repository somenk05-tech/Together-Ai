import { Body, Controller, Get, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../shared/current-user.decorator';
import { JwtUser } from '../shared/types';
import { ZodValidationPipe } from '../shared/zod/zod-validation.pipe';
import { MiraService, SEED_MAX } from './mira.service';
import { MiraRegistry } from './mira.registry';

/**
 * The largest seed either route will accept, and there is exactly one of it.
 *
 * `daySeed()` in the web package takes its hash modulo this number. It used to
 * appear here TWICE — ten million on the greeting, one million on the ask — and
 * the land script's gate read only the `z.coerce` spelling, so it compared the
 * greeting's bound against the web's, found them equal, and never saw the other
 * one. The result in production: every greeting returned 200 and every ask
 * returned 400, for every citizen whose day seed happened to exceed a million.
 *
 * A bound that is written down twice is a bound that will diverge. One constant,
 * both schemas, and the gate now asserts that no `seed:` line in this file
 * carries a numeric literal at all.
 *
 * It DERIVES the seed now rather than believing one, so the constant lives with
 * the derivation in `mira.service.ts` and is re-exported here — where the
 * schemas, the web package and `seed.spec.ts` have always read it from.
 */
export { SEED_MAX };

/**
 * How many model-backed turns one caller may spend in a minute.
 *
 * The three routes below are the only ones in this module that call a model,
 * and none of them carried a throttle: the 200-conversation meter is per
 * citizen for life, which is a budget, not a rate. The global limit is 120 a
 * minute and is sized for a person using the app; a person talking to Mira
 * needs a handful. Same mechanism as `geo.controller.ts` — `ThrottlerGuard` is
 * already the app-wide guard, so the decorator is the whole of the change.
 */
const MODEL_LIMIT = { default: { ttl: 60_000, limit: 20 } };

export const AskSchema = z.object({
  text: z.string().min(1).max(2000),
  /** Their local hour, sent by the client — the server's clock is the wrong one. */
  hour: z.number().int().min(0).max(23).optional(),
  weeksKnown: z.number().int().min(0).max(520).optional(),
  dial: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  distressLocked: z.boolean().optional(),
  recent: z.array(z.string().max(2000)).max(3).optional(),
  /**
   * Their IANA timezone, e.g. 'Asia/Kolkata'.
   *
   * Sent by the client for the same reason `hour` is — the server's clock is the
   * wrong one — and it cannot be derived from `hour`, because an offset guessed
   * from an hour rounds to the hour and is wrong by thirty minutes for every
   * citizen in India. Bounded and shape-checked like anything from a client;
   * it only ever reaches `Intl.DateTimeFormat`, which throws on nonsense, and
   * `clockTime` catches that and omits the clause rather than naming a wrong time.
   *
   * OPTIONAL, and that is the rule rather than a detail: a new field in a
   * request must not 400 a client that has not shipped yet.
   */
  tz: z.string().min(1).max(64).regex(/^[A-Za-z][\w+\-]*(?:\/[\w+\-]+)*$/, 'an IANA timezone').optional(),
  /** Session counter — picks the mood and which aside she reaches for. Sent by
   *  the client because the mood must hold across a conversation and the server
   *  keeps no session. Not security-relevant: it chooses a tone. */
  seed: z.number().int().min(0).max(SEED_MAX).optional(),
  /**
   * The options she offered last turn, handed back.
   *
   * This is the whole of her short-term memory, and it rides on the wire rather
   * than living on the server. Without it every turn starts from nothing, a
   * one-word reply goes back through the matcher that produced the question,
   * and she asks it again — which is exactly what production did.
   *
   * Bounded at three because she never offers more, and validated like anything
   * else that arrives from a client: it decides a navigation, so a path that did
   * not come from her would be an open redirect inside the app.
   */
  answering: z.array(z.object({
    label: z.string().min(1).max(80),
    path: z.string().min(1).max(200).regex(/^\/[\w\-/]*$/, 'an in-app path'),
  })).max(3).optional(),
  /**
   * The day's transcript, both voices, oldest first — the model's context.
   * Twelve turns is plenty of yesterday for a chat bubble; the thread itself
   * lives on the device and the server keeps no session. Optional, like every
   * field a client may not have shipped yet.
   */
  history: z.array(z.object({
    who: z.enum(['me', 'mira']),
    text: z.string().min(1).max(2000),
  })).max(12).optional(),
  /** Which tab is asking — friend (the companion) or city (the assistant).
   *  Optional: an older client is the assistant, which is what it shipped as. */
  /**
   * ACCEPTED AND IGNORED. There is one room now and the register is inferred
   * per turn — see the service. Kept in the schema because removing a field a
   * shipped client still sends turns every one of its asks into a 400.
   */
  mode: z.enum(['friend', 'city']).optional(),
  /** The in-app path they were standing on when they opened her, for the
   *  "ask about this page" door. Validated like `answering`'s paths: it
   *  reaches a prompt, not a redirect, but a client field is a client field. */
  page: z.string().min(1).max(200).regex(/^\/[\w\-/?=&.%]*$/, 'an in-app path').optional(),
});
export type AskDto = z.infer<typeof AskSchema>;

/**
 * One conversation, shown to her by the person it belongs to.
 *
 * The transcript arrives FROM THE CLIENT, and that is the scope mechanism
 * rather than a shortcut: the server never queries the chat tables for this,
 * so the only thing she can ever read is the window the citizen was looking
 * at when they pressed her mark. Bounded like everything from a client —
 * forty turns of a thousand characters is plenty of thread for a side panel.
 */
export const ConfideSchema = z.object({
  /** What they want from her about it. */
  ask: z.string().min(1).max(2000),
  /** The other person's display name, for the prompt only. */
  otherName: z.string().min(1).max(80).optional(),
  /** The visible window of the thread, oldest first, both voices. */
  transcript: z.array(z.object({
    who: z.enum(['me', 'them']),
    text: z.string().min(1).max(1000),
  })).max(40),
  /**
   * WHAT THEY PRESSED, not what they typed.
   *
   * 'draft' is the "Help me reply" button and it changes the shape of the
   * answer: a message to paste rather than a reading of the thread. Carried as
   * a mode rather than sniffed out of the ask text, because matching on a
   * button's label is a check that breaks the day somebody rewords the button.
   */
  mode: z.enum(['read', 'draft']).optional(),
});
export type ConfideDto = z.infer<typeof ConfideSchema>;

/** Which of her rooms to read. Absent means the assistant, as everywhere. */
export const ThreadSchema = z.object({
  room: z.enum(['friend', 'city']).optional(),
});
export type ThreadDto = z.infer<typeof ThreadSchema>;

/** One page of what she has kept about the asking citizen. Bounded like every
 *  read in this codebase; the defaults are a screenful. */
export const MemorySchema = z.object({
  room: z.enum(['friend', 'city']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
});
export type MemoryDto = z.infer<typeof MemorySchema>;

/** One day of the citizen's own daybook, and what they want to know about it. */
export const DaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a YYYY-MM-DD date'),
  ask: z.string().min(1).max(2000),
  tz: z.string().min(1).max(64).regex(/^[A-Za-z][\w+\-]*(?:\/[\w+\-]+)*$/, 'an IANA timezone').optional(),
});
export type DayDto = z.infer<typeof DaySchema>;

/**
 * What she needs to say hello, and all of it comes from the CLIENT.
 *
 * The hour, the day, whether this is the first open of it — every one is a fact
 * about the citizen rather than about the server, and a server in another
 * timezone deciding it is not 3am for somebody is the class of bug
 * `MasterProfile.timeZone` exists to prevent.
 *
 * Coerced, because a query string is text. Bounded, because these choose a tone
 * and nothing else — the worst a bad value can do is make her cheerful at the
 * wrong hour, and it still may not be a number this route trusts.
 */
export const GreetSchema = z.object({
  hour: z.coerce.number().int().min(0).max(23).optional(),
  /**
   * OPTIONAL NOW, because the server is the one that decides it.
   *
   * The client still sends its guess and an older client sends nothing else,
   * so the bound stays and is still the one bound. What changed is that the
   * number is answered rather than obeyed: see `seedOf` in the service.
   */
  seed: z.coerce.number().int().min(0).max(SEED_MAX).optional(),
  weeksKnown: z.coerce.number().int().min(0).max(520).optional(),
  firstOfDay: z.coerce.boolean().optional(),
  dial: z.coerce.number().int().min(0).max(2).optional(),
  distressLocked: z.coerce.boolean().optional(),
  sessionsSinceFourthWall: z.coerce.number().int().min(0).max(10_000).optional(),
});
export type GreetDto = z.infer<typeof GreetSchema>;

@Controller('mira')
@UseGuards(JwtAuthGuard)
export class MiraController {
  constructor(private readonly mira: MiraService, private readonly registry: MiraRegistry) {}

  /**
   * What Mira can do, generated from the decorators.
   *
   * In the product because it is the honest answer to "what can she do?" — and
   * because a generated list is the only kind that stays true.
   */
  @Get('capabilities')
  capabilities() {
    return this.registry.all().map(({ id, intent, risk, path }) => ({ id, intent, risk, path }));
  }

  /**
   * Hello, and which Mira turned up.
   *
   * A GET rather than part of the ask, because it is what she says BEFORE
   * anybody has asked anything.
   *
   * IT USED TO TOUCH NO DATABASE, and that was worth saying until the two
   * things it got wrong turned out to be facts about the citizen: which
   * character she is today (the browser derived it per device, so she was two
   * people) and which openings she has already used (nothing remembered, so
   * she repeated a cycle of twenty-four). Both live on the account now. Still
   * no hub and still no model — and still best-effort inside the service, so a
   * slow table is a quieter hello rather than an error.
   *
   * NOT a @Mira() capability. This is chrome, not something she does; putting
   * it in the manifest would mean the router could match "say hello" and route
   * a citizen's question into a greeting.
   */
  @Get('greeting')
  @UsePipes(new ZodValidationPipe(GreetSchema))
  async greeting(@CurrentUser() user: JwtUser, @Query() q: GreetDto) {
    const g = await this.mira.greeting(user.sub, {
      hour: q.hour,
      weeksKnown: q.weeksKnown,
      firstOfDay: q.firstOfDay,
      dial: q.dial as 0 | 1 | 2 | undefined,
      sessionsSinceFourthWall: q.sessionsSinceFourthWall,
    });
    return { hello: g.hello, ask: g.ask, mood: g.mood, levity: g.level, seed: g.seed };
  }

  /**
   * The one route that can reach a model on a citizen's own words.
   *
   * `hour`, `weeksKnown` and `distressLocked` are still ACCEPTED — removing a
   * field from a DTO 400s every client that has not shipped yet — and are no
   * longer trusted: the service derives all three from the account. `hour` is
   * passed on as the fallback for a citizen whose profile carries no zone.
   */
  @Post('ask')
  @Throttle(MODEL_LIMIT)
  @UsePipes(new ZodValidationPipe(AskSchema))
  ask(@CurrentUser() user: JwtUser, @Body() dto: AskDto) {
    return this.mira.ask(dto.text, {
      userId: user.sub,
      hour: dto.hour,
      weeksKnown: dto.weeksKnown,
      dial: dto.dial,
      distressLocked: dto.distressLocked,
      recent: dto.recent,
      tz: dto.tz,
      seed: dto.seed,
      answering: dto.answering,
      history: dto.history,
      mode: dto.mode,
      page: dto.page,
    });
  }

  /**
   * Thirty days of conversation for ₹999, from the city wallet.
   *
   * NOT a @Mira() capability and not reachable from the ask route — she still
   * cannot spend money. This is behind an explicit button that carries its
   * price on its face, and it uses the same unified payment rail as every
   * checkout in the city, so an empty wallet answers with the same sentence
   * everywhere. The capabilities, navigation and the greeting never touch the
   * meter; only model conversations are counted, and 200 of those are free.
   */
  @Post('subscribe')
  subscribe(@CurrentUser() user: JwtUser) {
    return this.mira.subscribe(user.sub);
  }

  /**
   * The visible thread, from her record — what makes the same conversation
   * appear on the phone and the site. A read of the citizen's own rows,
   * unmetered like every read; the client treats an empty or failed answer
   * as "use the device's own copy", so an older API costs nothing.
   */
  @Get('thread')
  @UsePipes(new ZodValidationPipe(ThreadSchema))
  thread(@CurrentUser() user: JwtUser, @Query() q: ThreadDto) {
    return this.mira.thread(user.sub, q.room === 'friend' ? 'friend' : 'city');
  }

  /**
   * WHAT SHE HAS KEPT ABOUT THE PERSON ASKING — and nobody else, ever.
   *
   * "It is truly gone" is a claim, and a claim about stored data that cannot be
   * inspected is one the citizen has to take on faith. This is the inspection:
   * their own turns, newest first, per room, paginated. The screen that renders
   * it is a build and is not in this landing; the endpoint is what makes the
   * promise checkable at all, and what that screen will read.
   *
   * Unmetered and unthrottled beyond the app-wide limit: reading your own
   * record costs no model call and is not a thing to ration.
   */
  @Get('memory')
  @UsePipes(new ZodValidationPipe(MemorySchema))
  memory(@CurrentUser() user: JwtUser, @Query() q: MemoryDto) {
    return this.mira.memory(user.sub, q.room === 'friend' ? 'friend' : 'city', {
      limit: q.limit ?? 50,
      offset: q.offset ?? 0,
    });
  }

  /**
   * Mira reads ONE DAY — the citizen's own page from the daybook.
   *
   * A separate route from `confide` because the source is different in the
   * way that matters: a chat window is somebody else's words handed over by
   * the person looking at them, and a daybook page is the citizen's own
   * record, read from the server. Same scope discipline either way — one
   * day, nothing around it.
   */
  @Post('day')
  @Throttle(MODEL_LIMIT)
  @UsePipes(new ZodValidationPipe(DaySchema))
  day(@CurrentUser() user: JwtUser, @Body() dto: DayDto) {
    return this.mira.readDay(user.sub, dto.date, dto.ask, dto.tz);
  }

  /**
   * Mira reads ONE conversation — the one the citizen showed her.
   *
   * A separate route rather than a mode on `ask`, because the separation IS
   * the promise: this path never touches her memory, the chart, the router
   * or the executor, and keeping it out of `ask` makes that checkable by
   * reading one method instead of auditing every branch of the big one.
   */
  @Post('confide')
  @Throttle(MODEL_LIMIT)
  @UsePipes(new ZodValidationPipe(ConfideSchema))
  confide(@CurrentUser() user: JwtUser, @Body() dto: ConfideDto) {
    return this.mira.confide(user.sub, {
      ask: dto.ask,
      otherName: dto.otherName,
      transcript: dto.transcript,
      mode: dto.mode,
    });
  }
}
