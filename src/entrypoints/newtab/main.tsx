import { createRoot } from 'react-dom/client';
import { db } from '../../core/instance';
import { App } from '../../ui/App';
import { seedDemo } from '../../ui/seed';
import '../../ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

async function start(container: HTMLElement): Promise<void> {
  // Demo content is available only in dev builds or with ?demo=1 so reviewers can see a populated UI.
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('demo')) await seedDemo(db);
  createRoot(container).render(<App />);
}

void start(root);
