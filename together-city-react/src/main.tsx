import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { clearChunkReloadFlag } from './app/ChunkBoundary';
import './index.css';

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
