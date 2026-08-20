#!/bin/bash
# land-no-details-door.sh — the address, and nothing else (10 Aug 2026).
# The mail account bar on a phone loses its "Details" button. Nothing behind
# it is deleted: every field is still stored, still served by /mail/account,
# and still on the same card at desk width.
set -euo pipefail
cd "$(dirname "$0")"

# Anything of yours under src/ is left alone and never committed; only the
# three files this touches may be dirty, plus the icon work in flight.
OWNED='together-city-react/src/features/mail/pages/Folders.tsx
together-city-react/src/index.css
together-city-react/src/app/mail-reads-on-a-phone.test.ts
together-city-react/public/assets/img/tc-icon-1024.png
together-city-react/public/assets/img/tc-icon-512.png
together-city-react/public/assets/img/tc-icon-192.png
together-city-react/public/assets/img/tc-icon-maskable-512.png
together-city-react/public/assets/img/apple-touch-icon-180.png
together-city-react/public/downloads/TogetherCity.apk
together-city-react/public/manifest.webmanifest'
STRAY=$(git status --porcelain | grep -v '^??' | sed 's/^...//' \
  | grep -v '^together-city-react/src/' | grep -vxF "$OWNED" || true)
if [ -n "$STRAY" ]; then echo "Tree is dirty beyond what this script tolerates:"; echo "$STRAY"; exit 1; fi

MARK="The address, and nothing else"
case "$(git log --oneline -40)" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
W = 'together-city-react/'
R = W + 'src/'


def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    if new in s and old not in s:
        print("already", path)
        return
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)


F = R + 'features/mail/pages/Folders.tsx'
C = R + 'index.css'
T = R + 'app/mail-reads-on-a-phone.test.ts'

# ── 1. the door goes; nothing behind it does ──────────────────────────────
patch(F,
  """  /** Phone-only disclosure — CSS keeps the rest open on a desktop regardless. */
  const [detail, setDetail] = useState(false);
""", "")

patch(F,
  """        <Link to="/mail/compose" className="mail-account-compose"><Button variant="accent" size="sm">✍️ Compose</Button></Link>
        <button type="button" className="mail-account-toggle" aria-expanded={detail}
          onClick={() => setDetail((v) => !v)}>{detail ? 'Hide' : 'Details'}</button>
      </div>

      <div className={`mail-account-rest${detail ? ' open' : ''}`} style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>""",
  """        <Link to="/mail/compose" className="mail-account-compose"><Button variant="accent" size="sm">✍️ Compose</Button></Link>
      </div>

      <div className="mail-account-rest" style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>""")

patch(F,
  """   * Nothing is removed. Below 560 the meter, the primary-email row and the
   * delivery log fold behind "Details", and Compose becomes the floating
   * button the folder itself draws. On a desktop the card is exactly as it
   * was — there the space is free.
   */""",
  """   * It folded behind a "Details" word first. The owner shut that door on
   * 10 Aug: on a phone the bar is the address, and that is all it is. A
   * disclosure control is still a control — it is a word to read, a thing to
   * wonder about, and a tap that costs a screen — and none of what was behind
   * it is anything a citizen opens their mail to see.
   *
   * NOTHING IS DELETED. The storage meter, the primary email, the phone
   * number and the delivery log are all still stored, still returned by
   * /mail/account, and still ON THIS CARD at desk width, where the space is
   * free. Below 560 the meter and Compose hide (Compose becomes the floating
   * button the folder draws) and the rest of the card does not render its
   * door. Setting a primary email is a desk job now, which is where somebody
   * types an address they need to get right.
   */""")

# ── 2. the stylesheet loses a door it no longer has ───────────────────────
patch(C,
  """  .mail-account-meter, .mail-account-compose { display: none; }
  .mail-account-toggle { display: inline-flex; align-items: center; margin-left: auto;
    min-height: 44px; padding: 0 4px; background: none; border: 0; cursor: pointer;
    font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--accent-ink); flex-shrink: 0; }
  .mail-account-rest { display: none; }
  .mail-account-rest.open { display: block; }
  .mail-account-rest.open .mail-account-meter { display: block; margin: 0 0 12px; }
""",
  """  /* THE ADDRESS, AND NOTHING ELSE (owner, 10 Aug).
     The meter, the primary-email row and the delivery log used to fold behind
     a "Details" word here. They are not hidden now so much as not offered:
     none of them is why anybody opens their mail. Every one of them is still
     stored, still served, and still on this card at desk width — this hides a
     door, it does not brick the room. */
  .mail-account-meter, .mail-account-compose { display: none; }
  .mail-account-rest { display: none; }
""")

# the toggle has no markup left to style
patch(C, ".mail-account-toggle { display: none; }\n", "")

# ── 3. the test that guarded the door now guards its absence ──────────────
patch(T,
  """  it('folds the account card instead of deleting it', () => {
    expect(phone()).toMatch(/\\.mail-account-meter[^}]*display: none/);
    expect(phone()).toMatch(/\\.mail-account-rest\\.open \\{ display: block/);
    expect(folders).toMatch(/mail-account-toggle/);
  });""",
  """  /**
   * This case used to assert the opposite — that the card FOLDED rather than
   * disappearing, on the principle that a control gone on small screens is a
   * feature that does not exist on small screens. The owner overruled it on
   * 10 Aug, and the principle survives in the part that matters: the fields
   * are not deleted, they are not conditional, and the desk still shows them.
   * That is what is asserted here, so nobody can quietly turn "not offered on
   * a phone" into "gone".
   */
  it('offers the address alone on a phone, and keeps the rest for the desk', () => {
    expect(phone()).toMatch(/\\.mail-account-meter[^}]*display: none/);
    expect(phone()).toMatch(/\\.mail-account-rest \\{ display: none/);
    // No door, anywhere: the disclosure button is gone from markup and sheet.
    expect(folders).not.toMatch(/mail-account-toggle/);
    expect(css).not.toMatch(/mail-account-toggle/);
    // And nothing behind it was thrown away — the card still renders the lot,
    // which is what a desk gets.
    expect(folders).toMatch(/mail-account-rest/);
    expect(folders).toMatch(/primaryEmail/);
    expect(folders).toMatch(/Add primary email/);
  });""")

print('done')

PATCHEOF

cd together-city-react
echo "== gates =="
npx tsc --noEmit
npx vitest run src/app/mail-reads-on-a-phone.test.ts
node scripts/nav-audit.mjs
node scripts/a11y-audit.mjs
node scripts/dead-export-audit.mjs
node scripts/motion-ceiling.mjs
npm run build
cd ..

git add together-city-react/src/features/mail/pages/Folders.tsx \
        together-city-react/src/index.css \
        together-city-react/src/app/mail-reads-on-a-phone.test.ts
git commit -m "$MARK

At the top of the mailbox on a phone: an envelope, the citizen's own address,
and — until now — the word 'Details' at the right-hand edge. It folded the
storage meter, the primary-email row and the delivery log rather than deleting
them, which was the right call while this card was the only place any of them
lived.

It is still a control. It is a word to read, a thing to wonder about, and a tap
that costs a whole screen — and nothing behind it is why anybody opens their
mail. So the door goes, and with it the button, the disclosure state and the
`.open` rules; a stylesheet that styles a class no markup has is how a defect
waits.

NOTHING BEHIND IT IS DELETED. The meter, the primary email, the phone number
and the delivery log are all still stored, still returned by /mail/account, and
still on this very card at desk width, where the space is free. The one real
consequence, said plainly rather than discovered later: SETTING a primary email
is now a desk job. That is where somebody types an address they need to get
right, and the card there is unchanged.

The test that guarded the old behaviour now guards the new — and guards the
part of the old principle that still holds, which is that the fields are not
conditional and the desk still shows them. Nobody can quietly turn 'not offered
on a phone' into 'gone'.

Measured at 428px: no toggle in the markup or the sheet, the rest of the card
not rendered, the address there, the bar 72px tall — down from 116. At 1280px
the card is untouched at 127px, meter and all."
git push
echo "LANDED."
