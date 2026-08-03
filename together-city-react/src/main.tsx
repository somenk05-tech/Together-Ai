import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { clearChunkReloadFlag } from './app/ChunkBoundary';
import './index.css';
// LAST, and that is the point. Relief overrides the ported component library
// rather than being merged into it, so the old rules stay readable as what they
// were and the new material is one file somebody can delete to see the
// difference. It replaced glass.css entirely: two material systems in one
// cascade is how the header ended up dark while the page under it was warm
// paper, and how there came to be two rival [data-hub] palettes fighting over
// the same variable.
import './styles/relief.css';

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
