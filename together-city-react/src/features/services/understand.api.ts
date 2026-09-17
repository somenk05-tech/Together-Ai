import { http as api } from '@/api/client';
import { useMutation } from '@tanstack/react-query';

/**
 * ── TELL US WHAT YOU DO (owner, 17 Sep) ──────────────────────────────────────
 *
 * One sentence up; a READING back — the trade, the business type whose
 * questions the owner will be asked, the engine that type runs on (what the
 * page will do), and the place the sentence named. Nothing is stored by this
 * call: the create screen pre-fills from it and the owner can change every
 * word of it before a listing exists. The shape mirrors
 * together-city-chat/src/local-services/understand.ts.
 *
 * Its own file rather than a line in api.ts on purpose: api.ts is the whole
 * hub's wire, and a reading is a different kind of thing from a listing — it
 * has no id, no owner and no row.
 */
export interface Understanding {
  categoryKey: string;
  categoryLabel: string;
  group: string;
  typeKey: string;
  typeLabel: string;
  engine: { key: string; label: string; builds: string };
  /** "café", "clinic", "garage" — the word after "Let's create your …". */
  noun: string;
  confidence: 'sure' | 'likely' | 'unsure';
  alternatives: Array<{ categoryKey: string; label: string; typeKey: string }>;
  city: string | null;
  area: string | null;
  name: string | null;
  source: 'rules' | 'model';
}

export function useUnderstandBusiness() {
  return useMutation({
    mutationFn: (text: string) =>
      api.post<Understanding>('/services/understand', { text }).then((r) => r.data),
  });
}
