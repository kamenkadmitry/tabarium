# Tabarium — project context

Read this first. It explains what the project is, the words used in the code, where things live, how to work on it and what was decided. Current work items are in the GitHub Issues (see "Roadmap").

## What it is

A local-first tab and session manager for Chromium browsers (Manifest V3), in the spirit of Toby: spaces → collections → links, an "Open tabs" panel with drag and drop, a side panel for quick saving, import and export of Toby files.

Principles (agreed with the owner, do not weaken them):
- **Local only.** No account, no server, no payments, no analytics. Data lives in IndexedDB in the user's browser.
- **Permissions on request.** Only `activeTab` (plus the side panel) at install. Everything else (`tabs`, `tabGroups`, `contextMenus`, `downloads`, `alarms`, host access for AI providers) is requested at the moment a feature needs it, from a user click.
- **Bring your own AI key (optional).** The user picks a provider and pastes a key in Settings. The key is never written to backups and never logged.
- **Own design and code.** This is a clean-room product with its own name and look; license MPL-2.0. Reference material about the original product lives outside this repository and must not be copied into it.

Deferred by agreement (not part of the local version): sharing and public pages, Toby's "To/Links" short links, Google Drive backup, accounts, payments.

## Words used in the code

| Term | Meaning |
| --- | --- |
| Space | Top-level group of collections (sidebar). `Inbox` is created on demand for quick saves |
| Collection | A titled group of links inside a space; has a colour, expanded flag and tags |
| Card / link / tab | A saved page (`Card` in code). Has title, optional custom title, address, favicon, note, star, tags and hashtags |
| Tag | Coloured label. Can be put on collections and on cards |
| Hashtag | Free-form `#label` for cards only, stored lowercase without `#` (`normalizeHashtag`) |
| Open tabs panel | Right-hand panel of the library listing live browser windows, groups and tabs; supports selection and drag into collections |
| Quick save | Popup, side panel and context menu saving into the remembered collection, default `Inbox / Saved tabs` |
| Inbox | The one system space (`Space.kind === 'inbox'`): fixed name, envelope icon, cannot be renamed, edited or deleted. Its default collection is "Saved tabs". The side panel's Inbox tab lists every link in it, so library and side panel are the same data. `ensureInbox` creates it, adopts an older plain "Saved tabs" space (even renamed) and merges the accidental empty copy. The old Next queue is retired: its rows stay in the database and backups but nothing shows them |
| Side panel | `sidepanel` entrypoint: Save tab, Group tabs, Inbox. The toolbar button opens it (setting: popup instead) |
| Platform | Port interface (`src/platform/ports.ts`) hiding browser APIs so the UI also runs in `?demo=1` without the extension |
| Profile | Name and avatar shown at the bottom of the sidebar, with a "Local" badge |

## Map of the code

```
src/core        pure logic, no browser APIs
  types.ts        Zod schemas and types (Space, Collection, Card, Tag, Hashtag; NextItem only for old backups)
  db.ts           Dexie database, schema versions (v3 added hashtags and card labels)
  repo.ts         all writes: spaces, collections, cards, tags, hashtags, import, duplicates
  ordering.ts / position.ts   positions step 100, midpoint insertion (planInsert)
  backup.ts       backup export, validation, restore (all or nothing)
  settings.ts     settings schema and defaults (stored as one row)
  formats.ts / toby.ts   Netscape bookmarks, plain text, Toby import and export
  organise.ts     context sent to the AI, applying proposed groups (reuse collection by title)
  ai/client.ts    provider adapters (anthropic, openai, google, openrouter, custom)
  ai/tasks.ts     collection names, grouping tabs, connection test
src/platform     browser access: chrome.ts (real), demo.ts (in-page), ports.ts (interface), files.ts
src/background   service worker: toolbar behaviour, context menu, backup alarm
src/entrypoints  newtab (library), popup, sidepanel, background
src/ui           React 19 + Tailwind v4 components; tokens in styles.css
  App.tsx          wires the library; Sidebar, SpaceBoard, CollectionCard, CardRow, OpenTabsPanel
  quick/           side panel and popup views
  dialogs/         modal dialogs; link editing uses LinkEditor (inline under the row on the board, in a dialog elsewhere)
  LinkEditor.tsx, useInlineEditor.tsx   the editor under a link and where it opens
  LabelChips.tsx, labels.tsx, LabelPages.tsx   "+" chips, one-line labels on rows, Tags and Hashtags pages
tests            Vitest unit tests (fake-indexeddb)
e2e              Playwright tests against the built extension
scripts/live     helpers for driving a live Chrome over CDP (manual checks, not CI)
docs/design      agreed mock-ups (see below)
```

Data rules worth knowing:
- Every write goes through `Repository`. Foreign ids are validated; failures throw.
- Backups are validated as a whole (`parseBackup`) including references; restore replaces everything in one transaction. Old backups without hashtags or card labels still load (defaults).
- Dexie versions only move forward; add a new `version(n)` with an `upgrade` for any change to stored shapes.
- Toby formats were derived from real exports and the original importer was run locally for compatibility only. Export "Toby-compatible JSON" imports into the real Toby (confirmed by the owner).

## AI behaviour

`groupTabs` receives the tabs plus the existing collections of the target space, tags and hashtags (up to 100 each). The prompt tells the model to reuse an existing collection title, to use only existing tags, and to give up to three hashtags per group (existing first). Results are checked in code: unknown tags are dropped, hashtags normalised, titles matched case-insensitively to existing collections, every tab ends in exactly one group ("Other" for leftovers). `applyGroups` saves them. Naming suggestions still see only the pages.

## Build, test, run

```bash
npm install
npm run dev          # browser with hot reload
npm run typecheck && npm run lint && npm test
npm run build        # release build in .output/chrome-mv3  (this is what to publish: npm run zip)
npm run build:e2e    # test build that grants all permissions up front. Never publish it
npx playwright test  # drives the e2e build in Chromium
```

- CI (`.github/workflows/ci.yml`): typecheck, lint, unit, build, e2e build and Playwright. Keep it green.
- Fast local run on Windows: the whole set (including the e2e tests in real Chromium) runs in about 35 seconds inside a WSL distro made for the project (`wsl-dev-env` skill: `new-env.ps1 -Name tabarium`, clone the repo in `~/tabarium`, `npm ci`, `npx playwright install --with-deps chromium`). Sync the committed state from the Windows working copy with `git fetch /mnt/c/.../tabarium HEAD && git reset --hard FETCH_HEAD` and run the same commands as CI. The Playwright Chromium on Windows itself does not start on the owner's machine.
- Build from the project root. If the terminal's working directory is inside `.output`, Windows reports EBUSY.
- Demo mode: open the library page with `?demo=1` to use the UI without the extension.

## Engineering rules (owner's policy)

- Fail fast: validate input, throw on invalid state. No fallbacks that hide missing data, no chained defaults for required values, no silent catch. Catch only expected errors, log context, rethrow or show them.
- No hidden retries. Every user action that can fail shows the failure (`run(...)` in `App.tsx` logs and displays it).
- Never log or persist secrets. API keys stay in settings only and are excluded from backups.
- Files under 500 lines (`App.tsx` is over and should be split), no docs or files that were not asked for, read a file before editing it.
- Accessibility: every control has an accessible name, keyboard reachable, visible focus, drag and drop always has a non-drag alternative (move menu), motion respects reduced motion.
- Tests: add unit tests for logic in `core`, e2e for flows. Prefer role and label locators in Playwright; check strictness (`exact: true`) when names overlap.
- Commits: no `Co-Authored-By` trailer unless the project's `.claude/settings.json` sets attribution. Do not publish releases or touch the Chrome Web Store without asking the owner.

## Design decisions

Style stays the current flat look: teal primary, orange action colour, Manrope, lucide icons, light and dark themes. A Material 3 variant was mocked and parked (issue 22). Agreed mock-ups are in `docs/design/`:

| File | Decision |
| --- | --- |
| `board-variant-a.png` | Board base: cards with a colour strip and two-line link rows. The Grid / Compact / Cards / List switch stays |
| `inline-editor-and-row-labels.png` | Editing happens in a panel that opens under the row (no modal). Row shows one line of labels with "+N" |
| `inline-editor-all-views.png` | How the editor sits in each view (stacked, narrow column, spanning tiles, three columns in List) |
| `add-label-with-plus.png` | Tags and hashtags: chips with a cross and a dashed "+" that becomes an inline field with suggestions and "Create ..." |
| `hashtags-page.png` | Hashtags page for many items: letter groups, counts, search, sort, unused filter, side panel for rename, merge, delete |
| `hashtag-filter.png` | Board filter by tag and hashtag with a searchable, scrollable list and removable chips |
| `parked-material3-*.png` | Parked alternative look, kept for reference |

Mock-ups are static; the real UI must follow them in structure, not pixel for pixel.

## Roadmap

GitHub Issues, milestones `v0.2 - safety and speed`, `v0.3 - reach and polish`, `Later`. Done: inline editor (20), tags and hashtags at scale (21), bulk actions on links (2), space icons, Inbox tab, AI proposing browser tab groups, dragging links from the side panel into the library. Next up, in this order: undo for deletes (1), interface languages Russian, Polish and Belarusian (3), quick search (4), first-run welcome (6).

## Status of verification

Everything above the roadmap is implemented and green in CI (104 unit tests, 27 e2e). The inline editor, one-line labels, Tags and Hashtags pages and the hashtag filter are verified by CI only; the owner has not opened them in Chrome yet. The owner confirmed in a real Chrome: panel resize, Next, Group Tabs, Import from file, profile badge and avatar, tags and hashtags pages, label pickers, AI organising, and that a Tabarium export imports into the real Toby.
