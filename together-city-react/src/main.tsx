import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { clearChunkReloadFlag } from './app/ChunkBoundary';
import { countThisVisit } from './api/visits.api';
import './index.css';
// LAST, and that is the point. Relief overrides the ported component library
// rather than being merged into it, so the old rules stay readable as what they
// were and the new material is one file somebody can delete to see the
// difference. It replaced glass.css entirely: two material systems in one
// cascade is how the header ended up dark while the page under it was warm
// paper, and how there came to be two rival [data-hub] palettes fighting over
// the same variable.
import './styles/relief.css';
/* AFTER RELIEF, WHICH IS WHERE IT SAT IN THE CASCADE BEFORE. These rules lived
   at line 1414 of relief.css and were written to override the `.g-*` glass
   above them; importing them earlier would put that argument the wrong way
   round. They are a file of their own now because living inside a 235KB
   stylesheet is how they came to be deleted by a stale copy without anybody
   noticing for two days. */
import './styles/social.css';
/* Baby Care's own stylesheet — see its header: the district arrived with one
   rather than 125 inline style objects, because the size ratchet's rule is
   'lower the number or raise nothing'. */
import './styles/babycare.css';
import './styles/mira.css';
// The one menu design every kitchen wears — see the file's own head note.
import './styles/menu-paper.css';
import './styles/grocery-store.css';
// Medical Mail's own sheet (owner, 16 Sep) — see its head note.
import './styles/medical-mail.css';
import './styles/media-desk.css';
import './styles/content-analytics.css';
// The investor dashboard's own sheet (owner, 16 Sep) — see its head note.
import './styles/insights.css';
// The Workout Library's own sheet (owner, 18 Sep) — see its head note.
import './styles/workout-library.css';
// The month's rows — two divisions, one month (owner, 18 Sep) — see its head note.
import './styles/workout-month.css';
import './styles/workout-day.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// App booted OK → clear the one-shot chunk-reload guard so a genuine future
// deploy can auto-recover again (and we never get stuck in a reload loop).
clearChunkReloadFlag();

// Every opening of the city is counted once per tab, for the Investor page's
// live counter (owner, 16 Sep). Fire and forget: see api/visits.api.ts.
// AFTER the first paint and the first real requests, not beside them: the
// counter shared the API connection with the calls that draw the page, and
// a beacon nobody is waiting for should not queue in front of them.
const idle = (fn: () => void): void => {
  // Safari has no requestIdleCallback; read it off `window` as an optional so
  // the fallback branch keeps its type.
  const ric = (window as { requestIdleCallback?: (cb: () => void, o: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 4000 }); else window.setTimeout(fn, 2500);
};
idle(countThisVisit);
