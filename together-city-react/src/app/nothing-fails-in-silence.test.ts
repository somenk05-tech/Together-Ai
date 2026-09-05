import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p: string[]) => readFileSync(join(web, ...p), 'utf8');
/** Comments are not code — every claim below is checked against statements. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const api = strip(read('api', 'chat.api.ts'));
const events = strip(read('api', 'events.ts'));
const composer = strip(read('features', 'chat', 'components', 'Composer.tsx'));
const bubble = strip(read('features', 'chat', 'components', 'MessageBody.tsx'));
const starter = strip(read('features', 'chat', 'components', 'ChatStarter.tsx'));
const page = strip(read('features', 'chat', 'pages', 'Chats.tsx'));
const dating = strip(read('features', 'dating', 'pages', 'DatingChats.tsx'));
const schemas = strip(read('api', 'schemas.ts'));

/**
 * ── NOTHING FAILS IN SILENCE (3 Sep) ────────────────────────────────────────
 *
 * The 3 Sep audit's headline finding: the gateway's ONLY failure channel is
 * `error_event`, and the whole front end contained exactly one occurrence of
 * that string — the constant declaring it. Nothing listened. So a photo
 * refused by moderation in a dating chat, a send over the rate limit, a
 * blocked pair and an ended match all produced the same thing on screen:
 * the caption cleared, the busy label went, and no bubble ever appeared.
 *
 * That failure mode is invisible by construction, which is why it survived —
 * and why it needs a guard rather than a memory. Every assertion here is a
 * way the silence could come back.
 */
describe('a refusal reaches the person who caused it', () => {
  it('subscribes to the two frames that carry an outcome', () => {
    expect(events).toMatch(/MESSAGE_ACK: 'message_ack'/);
    expect(api).toMatch(/socketClient\.on<[^>]*>\(WS\.MESSAGE_ACK/);
    expect(api).toMatch(/socketClient\.on<[^>]*>\(WS\.ERROR/);
  });

  it('hands the caller a promise that settles, rather than firing and forgetting', () => {
    // The signature is the contract: a `void` return here is the old bug.
    expect(api).toMatch(/const send = useCallback\([\s\S]{0,400}?\): Promise<void> =>/);
    // And it must not be able to hang: an ack that never arrives is the
    // commonest shape of this failure, not the rarest.
    expect(api).toMatch(/setTimeout\([\s\S]{0,600}?10_000\)/);
  });

  it('keeps the words and the attachments when the send is refused', () => {
    // The composer awaits onSend; a bare `onSend(...)` would clear the field
    // before the server had agreed to anything.
    expect(composer).toMatch(/await onSend\(/);
    expect(composer).toMatch(/onSend: \(body: string, attachments\?: OutgoingAttachment\[\]\) => void \| Promise<void>/);
  });

  it('is wired at both call sites, which is where it was missing', () => {
    expect(page).toMatch(/useChatRealtime\([\s\S]{0,160}?onRealtimeError\)/);
    expect(dating).toMatch(/onRealtimeError,/);
    expect(page).toMatch(/return send\(/);
    // Dating renames it on the way in; what matters is that the promise is
    // handed back rather than dropped.
    expect(dating).toMatch(/return wsSend\(/);
  });
});

/**
 * A PHOTO IS STAGED, THEN SENT. Picking a file used to BE sending it: no
 * preview, no caption, no cancel, and a Send key disabled unless there was
 * text — so attaching and then reaching for Send found a dead key.
 */
describe('the attachment tray', () => {
  it('stages what was picked instead of sending it', () => {
    expect(composer).toMatch(/void stageFiles\(files\)/);
    // The old shape, and the one to refuse: onPick calling the send path.
    expect(composer).not.toMatch(/onPick[\s\S]{0,300}?sendFiles\(/);
  });

  it('lets Send go with attachments and no words at all', () => {
    expect(composer).toMatch(/!body\.trim\(\) && staged\.length === 0/);
  });

  it('sends the text and the files as ONE message', () => {
    expect(composer).toMatch(/onSend\(text, staged\.length \? staged\.map\(/);
  });

  it('revokes the previews it made, so a long session does not leak them', () => {
    expect(composer).toMatch(/URL\.revokeObjectURL/);
  });
});

/**
 * A PICTURE RESERVES ITS SPACE. Without intrinsic dimensions the bubble is
 * ~0px tall when the thread scrolls itself, and the photo then decodes and
 * pushes the newest message below the fold — which reads, to the person who
 * sent it, as the photo not having sent.
 */
describe('an image bubble', () => {
  it('carries the sender-measured dimensions on the wire', () => {
    expect(schemas).toMatch(/width: z\.number\(\)/);
    expect(schemas).toMatch(/height: z\.number\(\)/);
  });

  it('reserves its space and says so when the bytes never come', () => {
    expect(bubble).toMatch(/aspectRatio/);
    expect(bubble).toMatch(/onError=\{\(\) => setTried\(\(n\) => n \+ 1\)\}/);
  });

  it('does not read a camera filename aloud to a screen reader', () => {
    expect(bubble).toMatch(/alt="Shared photo"/);
    expect(bubble).not.toMatch(/alt=\{a\.name/);
  });
});

/**
 * ── AND THE WAYS THE FIRST PASS OF THIS WORK BROKE IT ───────────────────────
 * An adversarial re-read of the change found five regressions it had
 * introduced. Every one of them is here, because a fix that arrives with its
 * own defect and no guard is just a different silence.
 */
describe('what the fix itself got wrong the first time', () => {
  const thread = strip(read('features', 'chat', 'components', 'MessageThread.tsx'));

  it('gives the composer a new instance per room', () => {
    // It holds staged attachments now. One instance across a switch sent a
    // photo attached in one thread into the next one opened.
    expect(page).toMatch(/<Composer key=\{activeId\}/);
    expect(dating).toMatch(/<Composer key=\{chat\.conversationId\}/);
  });

  it('always scrolls to your OWN message, even scrolled up', () => {
    expect(thread).toMatch(/mineArrived/);
    expect(thread).toMatch(/if \(!was\.atBottom && !mineArrived\) return;/);
  });

  it('does not mistake its own smooth scroll for the reader scrolling away', () => {
    expect(thread).toMatch(/const gliding = \(\) => Date\.now\(\) < chaseUntil\.current/);
    expect(thread).toMatch(/if \(gliding\(\)\) return;/);
  });

  it('honours the same jump target twice', () => {
    expect(thread).toMatch(/if \(!jumpToId\) \{ jumped\.current = null; return; \}/);
  });

  it('keeps the reply anchor until the send has landed', () => {
    expect(page).toMatch(/\.then\(\(\) => \{ setReplyTo\(null\); \}\)/);
  });

  it('says it is typing once per burst, not once per keystroke', () => {
    for (const src of [page, dating]) {
      expect(src).toMatch(/if \(t !== typingOn\.current\) \{ typingOn\.current = t; setTyping\(t\); \}/);
    }
  });

  it('does not report a message failed because a TYPING frame was dropped', () => {
    expect(api).toMatch(/if \(!e\?\.kind \|\| e\.kind === 'send'\)/);
  });

  it('does not call a photo gone because its thumbnail expired', () => {
    expect(bubble).toMatch(/tried === 0 && a\.thumbUrl \? a\.thumbUrl : a\.url/);
  });

  it('anchors the dating pager too, not only the city one', () => {
    expect(dating).toMatch(/const prepended = was\.first !== undefined/);
  });
});

/** The people picker was a div with an onClick, so it could be reached with a
 *  mouse and by nothing else — and "Start chat" stays disabled until somebody
 *  is picked. The same bug was fixed in share.tsx on 30 Aug and not carried. */
describe('the new-chat picker', () => {
  it('is reachable without a mouse', () => {
    expect(starter).toMatch(/<button type="button" key=\{c\.id\} aria-pressed=\{active\}/);
    expect(starter).not.toMatch(/<div key=\{c\.id\} onClick=/);
  });
});

/** Four actions used to catch their own failure and say nothing, so a delete
 *  past the window, a discarded edit, a refused pin and a failed mark-unread
 *  all looked exactly like success. */
describe('the page says when an action did not happen', () => {
  it('has somewhere to say it', () => {
    expect(page).toMatch(/const \[notice, setNotice\] = useState<string \| null>\(null\)/);
  });

  it('uses it on every action that can be refused', () => {
    for (const re of [
      /setNotice\(serverSaid\(e, scope === 'EVERYONE'/,      // delete
      /setNotice\(serverSaid\(e, 'That edit did not save/,   // edit
      /setNotice\(serverSaid\(e, on \? 'That message could not be pinned/, // pin
      /setNotice\(serverSaid\(e, 'That chat could not be marked unread/,   // unread
    ]) expect(page).toMatch(re);
  });

  it('does not render an empty room when the read failed', () => {
    expect(page).toMatch(/history\.isError/);
  });
});

/** The dating room passed its socket handlers as inline arrows, so the effect
 *  that owns the room membership re-ran on every render: leave, re-join, and a
 *  message broadcast in the gap missed entirely — plus a push notification for
 *  the chat you are looking at, because leaving clears the suppression flag. */
describe('the dating room stays in its room', () => {
  it('holds its handlers still', () => {
    expect(dating).toMatch(/const onLiveMessage = useCallback\(/);
    expect(dating).toMatch(/const onLiveTyping = useCallback\(/);
    expect(dating).toMatch(/const onRealtimeError = useCallback\(/);
  });

  it('acks what it reads, so the sender ticks move', () => {
    expect(dating).toMatch(/WS\.MESSAGE_READ/);
  });

  it('asks the row which kind it is instead of assuming romantic', () => {
    expect(dating).not.toMatch(/'romantic'/);
    expect(dating).toMatch(/useUnmatch\(c\.kind\)/);
  });
});
