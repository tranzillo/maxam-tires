# MAXAM Tires Website Rebuild - Implementation Plan

## Context

MAXAM Tires website is being rebuilt from WordPress (47 plugins, ACF Pro, WPML, WP Engine) to a modern static stack: **Astro SSG + Notion CMS + Tailwind CSS + Netlify**. Production has been greenlit. The project plan calls for a **vertical slice** approach: build the tire search page and tire detail pages in 3 languages (EN, AR-AE, ZH-Hant) to validate the full pipeline before expanding.

This plan covers the sequenced implementation steps for the vertical slice, starting from project creation through to a deployed preview.

---

## Decisions Made

| Decision | Choice |
|---|---|
| Project location | `C:\Users\kappa\Documents\Projects\maxam-tires\` (scaffold created) |
| Data source (initial) | Mock data in place, Notion next |
| Fonts | Copy Helvetica Neue WOFF2 from existing WP theme |
| Vertical slice data entry | **Semi-manual** — extraction scripts → JSON → manual Notion entry |
| Data extraction source | **Live Local MySQL** (`root:root@127.0.0.1:10017`, db: `local`) |
| Vertical slice translations | **Real WPML content** — extract actual AR/ZH-Hant translations |
| Notion DB creation | Manual via Notion UI (iterate on schema interactively) |
| Chinese locale | `zh-hant` (Traditional) — matches available WP content |

---

## Implementation Steps (Sequenced)

### Completed
- [x] Step 1: Project scaffold (Astro 6, Tailwind v4)
- [x] Step 3: Type definitions + mock data
- [x] Step 4: i18n setup (EN, AR-AE, ZH-Hant)
- [x] Step 5: Base layout + global components (Header, Footer, LanguageSwitcher)
- [x] Step 6: Tire search page (with client-side filtering)
- [x] Step 8: Tire detail page (basic structure)
- [x] WP data extraction scripts (taxonomies, tires, TablePress, translations)

### Remaining
- [ ] Step 2: Copy fonts + edge assets from WP theme, refine Tailwind config
- [ ] Step 7: Polish client-side filtering (URL params, pagination)
- [ ] Create Notion databases + enter vertical slice data
- [ ] Step 9: Wire up Notion API (`src/lib/notion.ts`)
- [ ] Step 10: GitHub repo + Netlify deployment
- [ ] Step 11: Cross-language testing + polish

---

## Content Migration: WordPress → Notion

### Extraction Results (completed)

124 unique English tires extracted. 5 selected for vertical slice:

| WP ID | Tire | Industry | Features | Sizes | Spec Columns |
|---|---|---|---|---|---|
| 2571 | MS401 | Mining, OTR | 6 | 9 | 12 cols, 30 rows |
| 2370 | AGRIXTRA 65 | Agricultural | 5 | 15 | 15 cols, 40 rows |
| 2371 | MS705 | Construction | 5 | 4 | 11 cols, 26 rows |
| 10705 | MS307 | Industrial/Forklift | 5 | 3 | 13 cols, 6 rows |
| 2420 | MS930 | Forestry | 6 | 4 | 10 cols, 22 rows |

All 5 have Arabic and Traditional Chinese translations with real translated content.

### Vertical Slice Execution Plan

1. **Review extracted JSON** in `scripts/output/slice-tires-*.json`
2. **Create Notion databases** — Industries, Applications, Tire Types, Sizes, Tires, Documents
3. **Manually enter data** — ~25-30 Notion pages (5 tires × 3 langs + taxonomy terms)
4. **Download gallery images + PDFs** to `public/images/tires/` and `public/documents/`
5. **Wire up `src/lib/notion.ts`** to replace `src/data/mock-tires.ts`

### Notion Database Schemas

**Tires:** Name, Slug, Subheading, Description, Featured Image, Gallery Images, Industries (relation), Applications (relation), Type (select), Sizes (multi-select), Rating (number), Features (rich text), Special Logo (files), Documents (relation), Published (checkbox), Lang (select), Translation Group (text)

**Industries:** Name, Slug, Color (hex), Background Image, Description, Lang, Translation Group

**Applications:** Name, Slug, Icon, Industries (relation), Lang, Translation Group

### Key SQL Queries

See `scripts/extract-*.ts` for full implementations. MySQL connection: `127.0.0.1:10017`, user `root`, pass `root`, db `local`.

---

## Design Tokens

| Token | Value | Tailwind Key |
|---|---|---|
| Sky Blue | `#e5f1f9` | `sky-blue` |
| Dark Blue | `#1c2858` | `dark-blue` |
| Blue | `#0077c8` | `brand-blue` |
| Green | `#009042` | `brand-green` |
| Orange | `#f79425` | `brand-orange` |
| Red | `#9e0b0f` | `brand-red` |
| Yellow | `#dcb127` | `brand-yellow` |

Typography: Helvetica Neue family. Container: 1170px. Pill buttons: 28px radius.

---

## WP Reference

Original site: `C:\Users\kappa\Local Sites\site-maxam-live-1762047567-h2ti73ddsldlabz4a8lpi4c\`
- Theme: `app/public/wp-content/themes/maxam/`
- `single-tire.php` — tire detail ACF fields + rendering
- `style.css` — design tokens, typography, component styles
- `template_blocks/` — reusable block templates
