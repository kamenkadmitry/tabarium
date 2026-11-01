# Chrome Web Store kit — Tabarium

Everything needed to submit Tabarium to the Chrome Web Store. The submission itself (developer account, $5 fee, publishing) is done by the owner.

## Contents

| File | Store field |
|---|---|
| `LISTING.md` | Name, short + full description (EN/RU/PL/BE), category, support links |
| `PRIVACY.md` | Privacy policy — host it (GitHub Pages or raw file URL) and paste the URL |
| `PERMISSIONS.md` | Per-permission justifications for the review form |
| `screenshots/` | Five 1280×800 listing screenshots |
| `tiles/promo-440x280.png` | Small promo tile (required) |
| `tiles/marquee-1400x560.png` | Marquee tile (optional) |
| `../public/icon/128.png` | Store icon (also shipped in the package) |

## Submission checklist

1. `npm run build && npm run zip` → package from `.output/` (never the `-e2e` build — it grants all permissions at install).
2. Developer dashboard → New item → upload the `.zip`.
3. Fill listing: description texts per language, category **Productivity**, support URL, privacy policy URL.
4. Upload: 128 icon, promo tile, 5 screenshots (in order 01→05).
5. Permission justifications — paste each answer from `PERMISSIONS.md`; remote code: **No**; data usage: **collects no data**.
6. Submit for review.

## Notes

- Screenshots are captured on the e2e build (`scripts/store-shots.mjs`) so optional-permission features are visible without browser prompts; the UI is identical to the release build.
- The package itself is always the release build — install asks for nothing but `activeTab`; every other capability is requested when its feature is first used.
