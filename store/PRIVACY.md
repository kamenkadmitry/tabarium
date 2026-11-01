# Tabarium — Privacy Policy

**Last updated: 2025**

Tabarium is a local-first bookmark manager. This policy describes, plainly, what the extension does with your data.

## The short version

- Everything Tabarium stores stays **on your device**, in the browser's IndexedDB.
- There is **no account, no Tabarium server, no analytics, no telemetry, no ads**.
- Tabarium's developers **cannot see** your bookmarks, your settings, or anything you do in the extension.

## What is stored, and where

Spaces, collections, links, tags, hashtags, notes, session snapshots, Inbox items, settings, and your import/export history live in IndexedDB inside your browser profile. Uninstalling the extension or clearing the site data deletes them. Export your library (Settings → Export) any time; the file is yours.

## Network requests — the complete list

Tabarium makes **no requests of its own**. It never phones home, and it has no home to phone. Network activity happens only in these cases, all initiated by you:

| When | Where the request goes | What it carries |
|---|---|---|
| You enable *Read page descriptions* (Inbox) | The saved page's own site, one site per request | Nothing — it is a plain GET of the page you saved |
| You use an AI feature | **Your own AI provider** — the endpoint you typed into Settings (e.g. your OpenAI-compatible URL) | The titles/URLs of the links you asked to process, plus your API key to that provider only |
| You export a backup | Nowhere — the file downloads locally | — |

Your AI API key is stored in local extension storage and is sent **only** to the provider endpoint you configured. Tabarium never relays it anywhere else.

## Permissions, one by one

- `activeTab` — read the tab you are looking at when you open the popup or press the save shortcut.
- `sidePanel` — show the Inbox in the browser side panel.
- `tabs` *(optional)* — the Open tabs view: list, save, reorder, and close your real tabs.
- `tabGroups` *(optional)* — reflect and manage browser tab groups in the Open tabs view.
- `contextMenus` *(optional)* — the right-click "Save to Tabarium" entries.
- `bookmarks` *(optional)* — import and tidy browser bookmarks.
- `downloads` *(optional)* — write export files to your disk.
- `alarms` *(optional)* — scheduled auto-backups and session snapshots.
- Website access *(optional, on request)* — read the description of pages you saved, and reach the AI endpoint you configured.

Optional permissions are requested **only** when you turn on the feature that needs them, and can be revoked at any time in `chrome://extensions` without breaking the library.

## Changes

If this policy ever changes, the change ships inside the extension package you already reviewed — there is no server to change silently.

**Contact:** https://github.com/kamenkadmitry/tabarium/issues
