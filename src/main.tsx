import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bootstrapPlatform } from './services/resourceLoader';
import './styles.css';

async function start(): Promise<void> {
  const runtime = await bootstrapPlatform();
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');
  createRoot(root).render(
    <StrictMode>
      <App runtime={runtime} />
    </StrictMode>,
  );
}

start().catch((error) => {
  console.error(error);
  const root = document.getElementById('root');
  if (root) root.textContent = 'Unable to start the game.';
});
