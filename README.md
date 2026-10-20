# Tabarium

Local-first tab and session manager for Chromium browsers. Save tabs into collections, organise them into spaces, restore sessions later.

- **No account, no server.** All data lives in the browser (IndexedDB).
- **Backups you control.** Export and import the whole library as one JSON file.
- **Bring your own AI key (optional).** Pick a provider and paste a key in Settings; nothing is sent anywhere until you do.

> Status: early development. The data layer (spaces, collections, cards, backup) is in place; the UI is next.

## Development

```bash
npm install
npm run dev        # launches a browser with the extension loaded
npm run typecheck
npm test
npm run build      # output in .output/chrome-mv3
```

## License

[MPL-2.0](LICENSE). You may use Tabarium anywhere, including in commercial and closed products. If you modify
files covered by this license, you must publish those modifications under the same license. Paid add-ons built
around the project are allowed.

Tabarium is an independent project and is not affiliated with any other tab manager.
