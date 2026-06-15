# MAXAM Tires

Marketing website — rebuild of maxamtire.com. **Astro 6 SSG + Notion CMS +
custom central CSS + Netlify.** Three locales: `en`, `ar-ae` (RTL), `zh-hant`.
Static build, fully offline (content comes from committed JSON snapshots).

> Start with [CLAUDE.md](CLAUDE.md) — it is the contract doc: standing
> decisions, real architecture, and current priorities. The latest full audit
> lives at [docs/AUDIT-2026-06-10.md](docs/AUDIT-2026-06-10.md).

## Tech Stack

- [Astro 6](https://astro.build/) — static site generator
- Custom central CSS (`src/styles/`) — semantic classes; Tailwind is legacy and
  being removed (do not add utility classes)
- [Notion](https://notion.so/) — CMS; synced to JSON snapshots at build time
- [Netlify](https://www.netlify.com/) — hosting and deployment

## Getting Started

```sh
npm install
npm run dev
```

Content sync from Notion requires `.env` with `NOTION_TOKEN` and
`NOTION_PARENT_PAGE_ID`, plus `scripts/output/notion-ids.json` (database IDs).

## Commands

| Command           | Action                                                     |
| :---------------- | :--------------------------------------------------------- |
| `npm install`     | Install dependencies                                       |
| `npm run dev`     | Dev server at `localhost:4321` (HMR — use while editing)   |
| `npm run build`   | Build production site to `./dist/` (~1050 pages)           |
| `npm run preview` | Serve the static `./dist/` build (no watching/HMR)         |
| `npm run sync`    | Pull content from Notion into `src/data/notion-content/`   |
| `npm run sync:fast` | Same, skipping page bodies (faster; metadata only)       |

After `sync`, restart the dev server — snapshots are read at startup.
