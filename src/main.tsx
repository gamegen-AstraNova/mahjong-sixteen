import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ASSETS } from './config/assets';
import { bootstrapPlatform, localAssetUrl, type BootstrapProgress } from './services/resourceLoader';
import './styles.css';

function LoadingScreen({ progress }: { progress: BootstrapProgress }) {
  const percentage = progress.total > 0 ? Math.round(progress.loaded / progress.total * 100) : 0;
  return (
    <main className="boot-loading-screen">
      <div className="boot-loading-stars" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <section className="boot-loading-card">
        <img src={localAssetUrl(`common/${ASSETS.logoHome}`)} alt="" />
        <div className="boot-loading-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
          <span style={{ width: `${percentage}%` }} />
        </div>
        <strong>{percentage}%</strong>
      </section>
    </main>
  );
}

async function start(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');
  const appRoot = createRoot(root);
  appRoot.render(<LoadingScreen progress={{ loaded: 0, total: 1 }} />);
  const runtime = await bootstrapPlatform((progress) => appRoot.render(<LoadingScreen progress={progress} />));
  appRoot.render(
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
