# Permission justifications — Chrome Web Store review form

Ready-to-paste answers for the "Permission justifications" step of the submission form.

## Single purpose description (required field)

> Tabarium is a bookmark manager that turns the new tab into a board for saving, organizing and revisiting links — spaces, collections, an Inbox, sessions and open-tab management, all stored locally in the browser.

## Required permissions

**activeTab**
> Reads the title and address of the tab the user is currently viewing when they open the extension popup or press the "Save current tab" shortcut — this is the link being saved to the library.

**sidePanel**
> Shows the extension's Inbox in the browser side panel so links can be filed without leaving the current page.

## Optional permissions (each is requested only when its feature is first used)

**tabs**
> Powers the "Open tabs" view: listing the browser's windows and tabs so the user can drag them into collections, reorder, save and close them, and powers saving/restoring tab sessions.

**tabGroups**
> Lets the Open tabs view display existing browser tab groups and group/ungroup the user's tabs on request (e.g. "Group tabs by site").

**contextMenus**
> Adds "Save to Tabarium" entries to the right-click menu for pages and links.

**bookmarks**
> Imports the browser's bookmark tree into the library and lets the user delete bookmarks/folders they chose to remove after import.

**downloads**
> Writes the user's exported library (JSON/HTML/text) to disk when they click Export in Settings.

**alarms**
> Schedules the periodic automatic backups and session snapshots the user enabled in Settings.

## Host permission (optional, on request: `https://*/*`, `http://*/*`)

> Two user-initiated features need site access: (1) "Read page descriptions" fetches the saved pages' own HTML to show their meta descriptions in the Inbox; (2) the optional AI features call the AI-provider endpoint the user typed into Settings. Both happen only after the user grants access; requests go directly to the site/provider and nowhere else.

## Declarations in the review form

- **Remote code:** No — the extension does not execute remote code; all code ships in the package.
- **Data usage / limited use:** The extension collects **no user data**. Everything is stored locally (IndexedDB). The only outbound requests are user-initiated page fetches and calls to the user's own AI endpoint; nothing is sent to the developer. See `PRIVACY.md`.
