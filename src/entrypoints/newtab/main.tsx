import { createRoot } from 'react-dom/client';
import { db } from '../../core/instance';
import { createChromePlatform } from '../../platform/chrome';
import { PlatformProvider } from '../../platform/context';
import { createDemoPlatform } from '../../platform/demo';
import { App } from '../../ui/App';
import { seedDemo } from '../../ui/seed';
import '../../ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

async function start(container: HTMLElement): Promise<void> {
  // `?demo=1` loads sample data and an in-memory browser stub so the UI can be reviewed outside an extension.
  const demo = new URLSearchParams(location.search).has('demo');
  if (demo) await seedDemo(db);
  createRoot(container).render(
    <PlatformProvider value={demo ? createDemoPlatform() : createChromePlatform()}>
      <App />
    </PlatformProvider>,
  );
}

void start(root);
