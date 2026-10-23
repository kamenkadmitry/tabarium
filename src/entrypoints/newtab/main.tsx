import { createRoot } from 'react-dom/client';
import { db } from '../../core/instance';
import { loadSettings } from '../../core/settings';
import { createChromePlatform } from '../../platform/chrome';
import { PlatformProvider } from '../../platform/context';
import { createDemoPlatform } from '../../platform/demo';
import { App } from '../../ui/App';
import { DuplicateGuardProvider } from '../../ui/DuplicateGuard';
import { seedDemo } from '../../ui/seed';
import '../../ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

async function start(container: HTMLElement): Promise<void> {
  // `?demo=1` loads sample data and an in-memory browser stub so the UI can be reviewed outside an extension.
  const demo = new URLSearchParams(location.search).has('demo');
  if (demo) await seedDemo(db);
  // Apply theme/palette before the first paint so a stored choice doesn't flash the default palette.
  const { theme, palette } = await loadSettings(db);
  if (theme !== 'system') document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.palette = palette;
  createRoot(container).render(
    <PlatformProvider value={demo ? createDemoPlatform() : createChromePlatform()}>
      <DuplicateGuardProvider>
        <App />
      </DuplicateGuardProvider>
    </PlatformProvider>,
  );
}

void start(root);
