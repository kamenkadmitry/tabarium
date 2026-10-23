import { createRoot } from 'react-dom/client';
import { db } from '../core/instance';
import { loadSettings } from '../core/settings';
import { createChromePlatform } from '../platform/chrome';
import { PlatformProvider } from '../platform/context';
import { createDemoPlatform } from '../platform/demo';
import { DuplicateGuardProvider } from './DuplicateGuard';
import { QuickSave } from './QuickSave';
import { seedDemo } from './seed';
import './styles.css';

/** Entry shared by popup and side panel: applies the saved theme and renders the quick-save surface. */
export async function mountQuickSave(surface: 'popup' | 'sidepanel'): Promise<void> {
  const root = document.getElementById('root');
  if (!root) throw new Error('#root not found');
  const demo = new URLSearchParams(location.search).has('demo');
  if (demo) await seedDemo(db);
  const { theme, palette } = await loadSettings(db);
  if (theme !== 'system') document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.palette = palette;
  createRoot(root).render(
    <PlatformProvider value={demo ? createDemoPlatform() : createChromePlatform()}>
      <DuplicateGuardProvider>
        <QuickSave surface={surface} />
      </DuplicateGuardProvider>
    </PlatformProvider>,
  );
}
