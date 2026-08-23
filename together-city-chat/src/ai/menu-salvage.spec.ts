import { AiService } from './ai.service';

/**
 * THE READER RAN OUT OF BREATH, NOT EYES (24 Aug).
 *
 * A real restaurant menu overran the extraction call's token budget: the model
 * transcribed faithfully, was stopped mid-item, the JSON never closed, and the
 * parse failure was reported as `unreadable` — "take a better photo" to a
 * shopkeeper whose photo was fine. These tests pin the salvage path: a reply
 * cut by `max_tokens` is re-closed at the last complete item and returned with
 * a note saying the tail may be missing, and only a genuine misread (garbage
 * with no recoverable items) still reads as `unreadable`.
 *
 * The service is stubbed at `createWithFallback` — the seam between "what the
 * model said" and "what we make of it" — because that is exactly the boundary
 * the bug lived on.
 */

type Stubbed = {
  client: unknown;
  logger: { warn: (msg: string) => void };
  visionModel: string;
  createWithFallback: (params: unknown) => Promise<{ stop_reason: string | null; content: Array<{ type: string; text: string }> }>;
  salvageTruncatedMenu: (raw: string) => { items?: unknown[]; note?: string } | null;
};

const reader = (reply: { stop_reason: string | null; text: string }): AiService => {
  // Through `unknown`, not an intersection: the fields being stubbed are
  // private on AiService, and TS collapses `AiService & Stubbed` to `never`.
  const svc = Object.create(AiService.prototype) as unknown as Stubbed;
  svc.client = {};
  svc.logger = { warn: () => undefined };
  svc.visionModel = 'vision-under-test';
  svc.createWithFallback = async () => ({
    stop_reason: reply.stop_reason,
    content: [{ type: 'text', text: reply.text }],
  });
  return svc as unknown as AiService;
};

const IMAGE = { base64: 'not-really-pixels', mediaType: 'image/jpeg' };

/** A transcription that stops mid-item, the way a token budget stops one. */
const TRUNCATED =
  '{"items":[' +
  '{"section":"Dosas","name":"Masala Dosa","priceInr":120},' +
  '{"section":"Dosas","name":"Rava Dosa","priceInr":140},' +
  '{"section":"Tiffin","name":"Idli Sambar","priceInr":80},' +
  '{"section":"Tiffin","name":"Medu Va';

describe('the menu reader, cut off mid-page', () => {
  it('keeps every item that survived the cut and says the tail may be missing', async () => {
    const out = await reader({ stop_reason: 'max_tokens', text: TRUNCATED }).extractMenu(IMAGE);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.items.map((i) => i.name)).toEqual(['Masala Dosa', 'Rava Dosa', 'Idli Sambar']);
    expect(out.items[0]).toMatchObject({ section: 'Dosas', priceInr: 120 });
    // The note owns up to the cut instead of blaming the photograph.
    expect(out.note).toMatch(/end of the menu may be missing/i);
  });

  it('still calls a genuine misread unreadable — salvage never invents items', async () => {
    const out = await reader({ stop_reason: 'max_tokens', text: 'I could not find a menu in this image.' }).extractMenu(IMAGE);
    expect(out).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('does not salvage a reply the model finished on its own — bad JSON at end_turn is a misread', async () => {
    const out = await reader({ stop_reason: 'end_turn', text: TRUNCATED }).extractMenu(IMAGE);
    expect(out).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('leaves a clean, complete read exactly as it was — no clip note on an untruncated reply', async () => {
    const clean = '{"items":[{"name":"Filter Coffee","priceInr":40}],"note":""}';
    const out = await reader({ stop_reason: 'end_turn', text: clean }).extractMenu(IMAGE);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.items).toEqual([{ name: 'Filter Coffee', priceInr: 40 }]);
    expect(out.note).toBe('');
  });
});
