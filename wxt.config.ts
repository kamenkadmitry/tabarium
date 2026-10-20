import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

const OPTIONAL = ['tabs', 'contextMenus', 'downloads', 'alarms', 'tabGroups', 'history'] as const;

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: ({ mode }) => {
    // The `e2e` build grants everything at install so automated tests can exercise the browser features
    // that normally sit behind a permission prompt (prompts cannot be clicked by test drivers).
    const e2e = mode === 'e2e';
    return {
      name: 'Tabarium',
      description: 'Local-first tab and session manager. No account, no server.',
      // Production: nothing but `activeTab` at install; every capability is requested when a feature needs it.
      permissions: e2e ? ['activeTab', ...OPTIONAL] : ['activeTab'],
      // AI providers are contacted only after the user grants that one origin when using an AI feature.
      optional_host_permissions: e2e ? [] : ['https://*/*', 'http://*/*'],
      host_permissions: e2e ? ['https://*/*', 'http://*/*'] : [],
      optional_permissions: e2e ? [] : [...OPTIONAL],
    };
  },
});
