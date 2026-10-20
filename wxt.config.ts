import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Tabarium',
    description: 'Local-first tab and session manager. No account, no server.',
    permissions: ['storage', 'unlimitedStorage', 'tabs', 'contextMenus', 'sidePanel', 'alarms', 'downloads'],
    optional_permissions: ['tabGroups', 'history'],
  },
});
