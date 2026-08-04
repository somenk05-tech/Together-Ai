/**
 * SPLIT A REPLY FROM THE CONVERSATION IT QUOTES.
 *
 * A reply from Gmail arrives carrying the entire history beneath it — the
 * attribution line, every previous message with `>` in front of it, and our own
 * "Sent by … via Together City Mail" footer at the bottom of the oldest one. A
 * four-word reply is fifty lines long, and by the third exchange the thing the
 * citizen actually wrote is a sliver at the top of a wall of its own past.
 *
 * Every mail client solves this the same way and so does this: show what is
 * new, and put the rest behind one small control.
 *
 * PURE, AND ITS OWN FILE, because the interesting part is not the toggle — it
 * is deciding where the new text stops, on real-world mail from clients that
 * each quote differently. That deserves tests, and tests deserve a function
 * with no React in it.
 */

/** The earliest line that begins the quoted history, or -1. */
function quoteStart(lines: string[]): number {
  let earliest = -1;
  const mark = (i: number) => { if (i >= 0 && (earliest === -1 || i < earliest)) earliest = i; };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Gmail / Apple Mail: "On <date> <person> wrote:" — sometimes wrapped, so
    // the colon may be on the next line. Anchored to the start so a sentence
    // that happens to contain the word "on" is not mistaken for one.
    if (/^on\b[\s\S]{0,200}\bwrote:$/i.test(line)) { mark(i); break; }
    if (/^on\b.{0,200}$/i.test(line) && /\bwrote:$/i.test((lines[i + 1] ?? '').trim())) { mark(i); break; }

    // Outlook, both of its shapes.
    if (/^-{2,}\s*original message\s*-{2,}$/i.test(line)) { mark(i); break; }
    if (/^from:\s*\S/i.test(line) && /^(sent|date):\s*\S/i.test((lines[i + 1] ?? '').trim())) { mark(i); break; }

    // A run of quoted lines. One `>` can be a person quoting a sentence; three
    // in a row is a client quoting a message.
    if (line.startsWith('>')
      && (lines[i + 1] ?? '').trim().startsWith('>')
      && (lines[i + 2] ?? '').trim().startsWith('>')) { mark(i); break; }
  }
  return earliest;
}

export interface SplitBody { latest: string; quoted: string }

/**
 * `latest` is what this person just wrote; `quoted` is everything they were
 * replying to. When nothing is quoted — or when the whole message IS the quote,
 * which happens on a forward with no comment — `quoted` is empty and the body
 * is shown whole. Hiding a message because it is entirely a quotation would be
 * the same bug as showing fifty lines of history, in the other direction.
 */
export function splitQuoted(body: string): SplitBody {
  const text = body ?? '';
  const lines = text.split('\n');
  const at = quoteStart(lines);
  if (at <= 0) return { latest: text, quoted: '' };

  const latest = lines.slice(0, at).join('\n').replace(/\s+$/, '');
  const quoted = lines.slice(at).join('\n').replace(/\s+$/, '');
  if (!latest.trim()) return { latest: text, quoted: '' };
  return { latest, quoted };
}

/**
 * Our own outbound footer — the rule and the "Sent by … via Together City Mail"
 * line appended to every external message.
 *
 * Stripped from the TOP-LEVEL body only. It says nothing a citizen reading
 * their own city inbox does not already know, and it is the single most
 * repeated string in any thread. Inside the quoted history it stays, because
 * that history is a record of what was actually sent.
 */
export function stripCityFooter(body: string): string {
  return (body ?? '').replace(/\n*─{4,}\nSent by [^\n]*via Together City Mail\.\s*$/i, '').replace(/\s+$/, '');
}
