import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'Tabarium',
    description: 'Local-first tab and session manager. No account, no server.',
    // Nothing is granted at install time: every capability is requested from the user when a feature needs it.
    permissions: ['activeTab'],
    // AI providers are contacted only after the user grants that one origin when using an AI feature.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    optional_permissions: [
      'tabs',
      'contextMenus',
      'downloads',
      'alarms',
      'tabGroups',
      'history',
    ],
  },
});
