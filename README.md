# Tabarium

Local-first tab and session manager for Chromium browsers. Save your open tabs into collections, organise them into spaces, and restore a whole session later.

- **No account, no server.** Everything is stored in your browser (IndexedDB). Nothing leaves your machine.
- **Backups you control.** Export and import the whole library as one JSON file, or let Tabarium write scheduled backups to your Downloads folder.
- **Permissions on request.** The extension installs with almost no permissions and asks for each one only when you use the feature that needs it.
- **Bring your own AI key (optional).** Choose a provider and paste a key in Settings. Nothing is sent anywhere until you do. The key is never included in backups.

## Features

| Area | What you can do |
| --- | --- |
| Library | Spaces → collections → tabs; create, rename, recolour, delete; add links by hand |
| Saving | Save session (all tabs of a window, keep or close them), toolbar popup, side panel, right-click menu |
| Organising | Drag and drop tabs and collections (also between spaces), move via dialog, tags with colours, filter by tag |
| Notes and stars | Edit a tab's title, address and note; star tabs; Starred view |
| Next | A queue of tabs to look at: reorder, mark done |
| Finding things | Search across all spaces including notes; Duplicates view |
| Restoring | Open all, open as a browser tab group, or replace the current window's tabs |
| Data | JSON backup/restore, Netscape bookmarks HTML export and import, plain-text export |
| Toby files | Import Toby exports (.json v4 and older, .txt, .html) with notes, custom titles and tags; export a Toby-compatible .json |
| AI (optional) | Suggest a collection name, group a session's tabs into collections, connection test; your provider and key |
| Appearance | Light, dark or system theme |

## Install (from source)

```bash
npm install
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked** and select `.output/chrome-mv3`.

## Permissions

| Permission | When it is requested | Why |
| --- | --- | --- |
| `activeTab`, `sidePanel` | At install (no warning shown) | Save the current tab from the popup; show the side panel |
| `tabs` | First "Save session", "Save all tabs" or "Replace window tabs" | Read titles and addresses of open tabs |
| `contextMenus` | Enabling the right-click menu in Settings | Save page, link or window from the browser menu |
| `alarms`, `downloads` | Enabling automatic backup in Settings | Run on a schedule and write backup files |
| `tabGroups` | Enabling "Open collections as tab groups" | Group the tabs of an opened collection |
| One web origin (your AI provider) | First AI action or "Test connection" | Send the prompt to the provider you configured |

## Privacy

Tabarium has no analytics, no telemetry and no remote code. There is no backend. The only network request the extension may ever make is to the AI provider you configure yourself, and only for features you trigger.

## Development

```bash
npm run dev         # launches a browser with the extension and hot reload
npm run typecheck
npm run lint
npm test            # unit tests (Vitest, fake-indexeddb)
npm run test:e2e    # builds, then drives the real extension in Chromium (Playwright)
                    # uses an `e2e` build that grants permissions up front so no prompt blocks the run
```

Layout:

- `src/core` — data model (Zod schemas), IndexedDB access (Dexie), repository, ordering, backup, formats. No browser-extension APIs.
- `src/platform` — the single seam to browser APIs (`tabs`, permissions), with a real and a demo implementation.
- `src/ui` — React UI (Tailwind v4, design tokens in `styles.css`).
- `src/background`, `src/entrypoints` — service worker, new tab page, popup, side panel.

Open `newtab.html?demo=1` from a built copy served over HTTP to review the UI with sample data and a stubbed browser.

## License

[MPL-2.0](LICENSE). You may use Tabarium anywhere, including in commercial and closed products. If you modify files covered by this license, you must publish those modifications under the same license. Paid add-ons built around the project are allowed.

Tabarium is an independent project and is not affiliated with any other tab manager.
