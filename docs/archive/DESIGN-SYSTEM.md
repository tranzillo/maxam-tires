# MAXAM Design System Inventory

> Audit captured 2026-06-07. This document is the source of truth for what UI exists, what's inconsistent, and what needs designing. Updated as the system evolves.

## 1. Where we are

A working vertical slice with ~16 components and ~9 pages across 3 locales. Visual decisions were made in flight (i.e., "designed by developer"). The components work but the system has gaps:

- **No shared Button component** — 5 distinct button styles inlined across pages
- **No Heading component** — h1/h2/h3 sizes chosen per page, including a separate scale inside NotionBlocks
- **No Form component** — 3 different input stylings (contact form, search, language selector)
- **No Breadcrumb component** — same shape implemented inline on 3+ detail pages
- **Multiple Badge/Pill implementations** — 8 different padding+color variations across IndustryBadge, ArticleCard type label, filter pills, application tags, active filter chips
- **Card components** exist but inconsistent (ProductCard uses `shadow-lg`, FeaturedCard uses `shadow-md`, IndustryCard has no padding while others do)
- **Empty/loading/error states** mostly absent or minimal

This document inventories everything and proposes the structure for the design pass.

---

## 2. Existing components

Grouped by layer of the atomic-design hierarchy (atoms → molecules → organisms → templates).

### Atoms

| Component | File | Status |
|---|---|---|
| **IndustryBadge** | `src/components/ui/IndustryBadge.astro` | Real component. Props: `name`, `color`, `size?`, `href?`. Used in ProductCard + FeaturedCard. |
| **Button** | — | **Missing.** 5 inline variants in the wild. |
| **Heading** | — | **Missing.** Sizes set per-page. |
| **Input / Select / Textarea** | — | **Missing.** 3 inline styles. |
| **Link** | — | Mostly Tailwind utilities applied inline; no abstraction. |
| **Icon** | — | **Missing.** Inline SVGs everywhere; no shared library. |

### Molecules

| Component | File | Status |
|---|---|---|
| **ProductCard** | `src/components/ui/ProductCard.astro` | Real. `tire`, `locale`, `accentColor?`, `showFilterData?`. Square image, hover scale, industry badges, accent CTA. |
| **ArticleCard** | `src/components/ui/ArticleCard.astro` | Real. `article`, `locale`, `showFilterData?`. 16:9 image, type badge overlay, date + excerpt. |
| **FeaturedCard** | `src/components/ui/FeaturedCard.astro` | Real. Compact card variant for mega nav. Renders either product OR article. |
| **IndustryCard** | `src/components/ui/IndustryCard.astro` | Real. Industry color block with title overlay. |
| **OfficeCard** | — | **Inline on contact page.** Border box with location, address, phone. |
| **DocumentCard** | — | **Inline on product detail page.** Type label + title + file link. |
| **TestimonialCard** | — | **Missing.** Data extracted to Notion (21 rows) but never rendered. |
| **EventCard** | — | **Missing.** Data extracted (6 events) but never rendered as standalone card. |
| **Breadcrumb** | — | **Inline** on 3 detail pages with same shape. |
| **FilterPill** | — | **Inline** in resources page filter bar; 2 size variants used. |
| **ActiveFilterChip** | — | **Inline** in products page filter sidebar. |
| **Pagination** | — | **JS-generated inline** in resources and products pages. |
| **Hero** | `src/components/ui/Hero.astro` | Real. `heading`, `subheading?`, `backgroundImage?`, `overlayColor?`. Single variant. |
| **Section** | `src/components/ui/Section.astro` | Real. `heading?`, `subheading?`, `viewAllHref?`, `background?`. Wraps page sections. |
| **ContentGrid** | `src/components/ui/ContentGrid.astro` | Real. `columns?: 2|3|4`. Responsive grid wrapper. |
| **SpecTable** | `src/components/ui/SpecTable.astro` | Real. Multi-column table with sticky first column for product specs. |

### Organisms

| Component | File | Status |
|---|---|---|
| **Header** | `src/components/global/Header.astro` | Sticky black header. Logo + desktop nav + mobile hamburger. |
| **MegaNav** | `src/components/global/MegaNav.astro` | Two absolutely-positioned panels (Products, Resources) triggered from Header. Includes FeaturedCard. |
| **MobileMenu** | (inside Header.astro) | Expandable sections with chevron rotation. Inline scripts. |
| **LanguageSwitcher** | `src/components/global/LanguageSwitcher.astro` | HTML `<select>` dropdown. Differs from form selects in styling. |
| **Footer** | `src/components/global/Footer.astro` | 3-column grid + copyright. |
| **NotionBlocks** | `src/components/NotionBlocks.astro` | Renders Notion block tree. Handles paragraph/heading/list/table/image/quote/callout/toggle/code/columns. |
| **NotionRichText** | `src/components/NotionRichText.astro` | Inline formatting for Notion text. |
| **ProductFilterSidebar** | — | **Inline on products page.** Industry/Application/Size/Rating filter groups + clear button. |
| **ResourceFilterBar** | — | **Inline on resources page.** Type pills + Industry pills, separate rows. |
| **ContactForm** | — | **Inline on contact page.** Dark blue container with white inputs, white submit button. |

### Templates / Layouts

| Layout | File | What it does |
|---|---|---|
| **BaseLayout** | `src/layouts/BaseLayout.astro` | Doctype + Header + main slot + Footer. Sets HTML `lang` + `dir`. |
| **Homepage** | `src/pages/[locale]/index.astro` | Hero + Industries grid + Featured Products + Resources teaser |
| **Products list** | `src/pages/[locale]/products/index.astro` | Filter sidebar + product grid + pagination |
| **Industry hub** | `src/pages/[locale]/products/[industry]/index.astro` | Industry hero + product grid for that industry |
| **Product detail** | `src/pages/[locale]/products/[industry]/[slug].astro` | Breadcrumb + header + Notion body + documents + CTA |
| **Resources list** | `src/pages/[locale]/resources/index.astro` | Type filter pills + Industry filter pills + article grid + pagination |
| **Article detail** | `src/pages/[locale]/resources/[slug].astro` | Breadcrumb + header + featured image + Notion body |
| **Contact** | `src/pages/[locale]/contact/index.astro` | Contact form + office cards |

---

## 3. Design tokens currently defined

### Brand colors (`src/styles/global.css`)
```
--color-maxam-blue: #0077c8
--color-maxam-blue-dark: #005a9e
--color-maxam-black: #1a1a1a
--color-maxam-white: #ffffff
```

### Neutral scale
```
--color-maxam-gray-900: #2d2d2d   (rarely used)
--color-maxam-gray-700: #4a4a4a
--color-maxam-gray-500: #6b6b6b
--color-maxam-gray-300: #b0b0b0
--color-maxam-gray-100: #f0f0f0
```

### Industry colors
Stored per-industry in Notion (not in CSS). Examples:
- Agricultural: green
- Construction: orange
- Mining: gold
- Off-the-road: blue
- Underground mining: dark gold
- Solid OTR: purple
- Rubber tracks: gray-blue

Applied via inline `style={`background:${ind.color}`}` — no class abstraction.

### Type scale (Tailwind defaults, used throughout)
`text-xs` (12px) → `text-5xl` (48px). No custom typography token layer beyond Tailwind.

### Spacing tokens
- `--spacing-section: 5rem` (80px)
- `--spacing-section-sm: 3rem` (48px)
- Container max: `--container-max: 1280px`

### What's missing as tokens
- Button heights / paddings as named tokens
- Border radius scale (currently mix of `rounded`, `rounded-lg`, `rounded-full`)
- Shadow scale (currently `shadow-md` vs `shadow-lg` chosen ad hoc)
- Z-index scale (currently inline `z-40`, `z-50` in nav)
- Transition timing tokens (currently `duration-300` inline)
- Focus ring color (inconsistent — `ring-maxam-blue` on search input, `ring-maxam-white` on contact form, none on nav buttons)

---

## 4. Inconsistencies the audit found

These are the things to fix during the design pass:

### Typography
- 6 different h1 sizes used across pages (3xl on listing, 4xl on detail, 3xl→5xl on hero)
- NotionBlocks defines its own heading scale (`text-3xl/2xl/xl` with custom margins) that doesn't match component headings
- No semantic abstraction — every page picks a size in isolation

### Buttons
- 5 distinct button stylings:
  1. **Solid white-on-dark CTA** — home hero, industry hero (`bg-maxam-white text-maxam-black px-6 py-3 rounded`)
  2. **Solid blue CTA** — product detail (`bg-maxam-blue text-maxam-white px-6 py-3 rounded`)
  3. **Pill submit** — contact form (`bg-maxam-white text-maxam-blue py-2.5 rounded-full`)
  4. **Filter pill** — resources page (`border px-4 py-1.5 rounded-full`, two size variants)
  5. **Pagination** — products + resources (`border px-3 py-1.5 rounded`)
- Hover, focus, disabled states all handled inconsistently

### Cards
- Same conceptual "card with border + image + content" implemented 4 different ways:
  - ProductCard: square image, `shadow-lg` on hover, padding inside content
  - ArticleCard: 16:9, `shadow-lg`, same padding pattern, but with absolute badge overlay
  - IndustryCard: 16:9, `shadow-lg`, no padding (content overlaid on color)
  - FeaturedCard: 16:9, `shadow-md` (lighter), tighter padding (`p-3` vs `p-4`)
- Title weights differ: ProductCard uses `font-bold text-lg`, FeaturedCard uses `font-semibold text-sm`

### Badges / pills
8 stylings in active use:
| Use | Where | Padding | Background | Text |
|---|---|---|---|---|
| Industry (sm) | IndustryBadge | `px-2 py-0.5` | inline color | white, xs |
| Industry (md) | IndustryBadge | `px-3 py-1` | inline color | white, sm |
| Article type | ArticleCard overlay | `px-2 py-0.5` | maxam-blue | white, xs |
| Article type (mega) | FeaturedCard | `px-1.5 py-0.5` | maxam-blue | white, 10px |
| Application tag | Product detail inline | `px-3 py-1` | gray-100 | default, sm |
| Type filter pill | Resources page | `px-4 py-1.5` | bordered | sm |
| Industry filter pill | Resources page | `px-3 py-1` | bordered | xs |
| Active filter chip | Products sidebar | `px-2 py-1` | gray-100 | gray-700, xs |

All express the same idea — a categorical label — but no shared component.

### Form inputs
- Search input: `bg-white border-gray-300 focus:ring-maxam-blue`
- Contact form inputs: `bg-white focus:ring-maxam-white` (inside a blue container)
- Language switcher select: `bg-gray-900 text-gray-300 border-gray-700 focus:ring-1 focus:ring-maxam-blue`

### Breadcrumbs
- Same shape on 3 detail pages, all inline:
  - `<nav class="text-sm text-maxam-gray-500 mb-6">`
  - Links: `hover:text-maxam-blue`
  - Current: `text-maxam-black font-medium`
  - Separator: `<span class="mx-2">/</span>`

### Nav links
- 5 different link stylings across Header / MegaNav / MobileMenu / Footer
- All hover transition consistently but base colors and weights differ

---

## 5. Patterns we'll need but don't have yet

From the data side, we have content types with no UI:
- **Testimonials** (21 Notion rows) — need carousel or grid card
- **Events** (6 rows with start/end dates) — need date-prominent card variant
- **Document downloads** (390 rows) — currently inline list on product detail; needs proper download card

From the UX side, we lack:
- **Empty states** with illustration / guidance / CTA
- **Loading states** (skeleton or spinner) — relevant if/when client-side fetch is added
- **Error states** — currently silent failure
- **Tabs / Accordion** — useful for product spec organization, FAQ sections
- **Modal / Dialog** — useful for image gallery zoom, document preview
- **Toast / Snackbar** — for form submission feedback
- **Tooltip** — for industry color legend, technical terms
- **Table of Contents** — useful for long articles (we stripped TOC scaffolding during import)
- **Related Content section** — at end of article/product pages
- **Gallery / Image carousel** — products have multiple gallery images, currently only featured shown on cards

From the brand side:
- **Hero variants** — every page reuses Hero with different content but same layout. Industry hubs, About page, etc. probably want distinct treatments.
- **CTA section** — recurring "Talk to sales" or "Find your product" callouts
- **Footer** is minimal — likely needs newsletter signup, social links, certifications/awards section

---

## 6. Proposed structure for the design pass

Working in this order will give us the most leverage:

### Phase 1 — Atomic foundation (sets the vocabulary)
1. **Design tokens audit + refactor** — pull all hardcoded values into named CSS variables (button heights, radii, shadows, transitions, focus ring color). One file: `src/styles/tokens.css`.
2. **Typography component (`<Text>` / `<Heading>`)** — props for `as`, `size`, `weight`, `color`. Single source of truth for type.
3. **Button component** — variants: `primary`, `secondary`, `outline`, `pill`, `ghost`. Sizes: `sm`, `md`, `lg`. States: hover, focus-visible, disabled, loading.
4. **Badge/Chip component** — replaces IndustryBadge + all the inline variants. Variants by purpose: `category`, `type`, `filter`, `status`.
5. **Form atoms** — `Input`, `Select`, `Textarea`, `Label`, `FieldGroup`. Consistent focus state, error state, disabled state.

### Phase 2 — Card system (highest reuse, immediate visual impact)
6. **Card primitives** — `<Card>` wrapper with shared border/shadow/hover patterns. ProductCard, ArticleCard, FeaturedCard, IndustryCard refactored to use it.
7. **New card variants** — DocumentCard, TestimonialCard, EventCard, OfficeCard.

### Phase 3 — Navigation + chrome
8. **Header redesign** — including mobile nav animation
9. **MegaNav redesign**
10. **Footer expansion** — likely needs new sections (newsletter, social, accreditations)
11. **Breadcrumb component** — pulled out of pages

### Phase 4 — Section / hero templates
12. **Hero variants** — at minimum: marketing hero, industry hero, page header (no image). Probably designer comes up with 4–6 distinct hero treatments.
13. **CTA section component**
14. **Section component refinement** — add background variants beyond white/gray

### Phase 5 — Page-level
15. **Homepage redesign**
16. **Industry hub redesign**
17. **Product detail polish**
18. **Article detail polish**
19. **Resources hub polish**
20. **About / Company / Contact pages** (likely new)

### Phase 6 — Polish / states
21. **Empty / loading / error states**
22. **Accessibility audit** (focus visibility, ARIA labels, keyboard nav, color contrast)
23. **Mobile-first review pass**

---

## 7. Suggested next move

Build a **live component gallery page** at `/_design` (gated by env var so it doesn't ship to production). This page renders every existing component in every existing variant with sample data, plus placeholders for what's missing. It becomes:

- A self-documenting visual spec (always reflects what's actually shipping)
- A target for the designer (here's everything, in one URL)
- A QA surface (instant visual regression check)
- A communication tool (link to it in conversations with stakeholders)

Building this is ~1 session of work. The output is what we hand to the designer (and to ourselves) to iterate on.

After the gallery exists, every Phase-1 atomic component we build appears there, so progress is visible page-by-page.

---

## 8. Open questions for the design conversation

These should be resolved before or during the design pass:

- **Typography choice** — currently using Tailwind/system defaults. Custom font? Brand font from the WP site?
- **Iconography** — we have inline SVGs. Adopt Heroicons/Lucide/custom set?
- **Photography vs illustration** — for hero images, empty states, etc.
- **Industry color usage** — currently surfaces in badges and inline backgrounds. Should it be more prominent (e.g., colored borders on cards by industry)?
- **Footer scope** — newsletter? Social? Awards? Site map? Legal?
- **About / Company narrative** — we have no content here yet; needs writing + design together
- **Search experience** — products page has client-side filter only. Full-text search across all content (via Pagefind) is achievable but not built.
- **Mobile experience emphasis** — the WP site has heavy mobile traffic; do we design mobile-first or desktop-first?
