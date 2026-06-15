# WP → Astro Page Parity Audit

> Captured 2026-06-09 from the localhost WP backup at `:10018` and theme PHP at
> `wp-content/themes/maxam/`. This is the spec for Phase 4: rebuilding each WP
> page in our rubbermorphism system with full content + layout parity.

> **⚠ STATUS NOTE (2026-06-10):** This doc remains the best WP content-parity
> reference (~90% verified accurate), with corrections:
> 1. **Ignore all `Rubber*` component naming.** The standing decision (see
>    CLAUDE.md) bans the Rubber prefix; existing Rubber* components are legacy
>    pending rename. Any NEW component this doc prescribes gets a semantic name.
> 2. Component names that never existed on disk: `RubberHero`, `RubberPromoPair`,
>    `RubberSustainabilityStrip`, `RubberNewsletterCTA`, `ContentGrid` — the
>    homepage sections are built with `Section` + page CSS (`src/styles/pages/home.css`).
> 3. The claim that the resources filter bar "uses RubberChips now" is false —
>    it is still raw Tailwind buttons pending migration.
> 4. Homepage TODOs in §1 (testimonials page, sustainability page, newsletter
>    endpoint) are still open as of 2026-06-10.

## How to read this doc

For each page on the WP site, the audit captures:
- Sections in order, top to bottom
- Which theme block (`template_blocks/block_*.php`) renders each section
- What content goes in (copy, images, data sources)
- Whether we have an equivalent in our Astro project, and what gaps exist

At the end: pages WP has that we haven't built routes for yet, plus a catalog
of the 37 reusable ACF blocks we should know about.

---

## 1. Homepage — `/` *(rebuilt 2026-06-09, content parity)*

**Purpose:** sales funnel entry; showcases industries, featured products, brand, testimonials.

**Sections, top to bottom (matches WP order):**

1. **Hero** — `RubberHero`
   - Copy: lead "Get the Job" + heading "Done" + WP description + "Why Maxam?" CTA
   - BG: `/images/hero-home.jpg` (copied from WP uploads `hero-home.jpg`)
   - **Status:** ✓ done. CTA links to `/products` because no `/why-maxam` page yet.

2a. **Promo card pair** — `RubberPromoPair`
   - Left card: "Find Your Grip" / "Take advantage of the most cutting-edge…" / Explore Products → `/products` over `/images/promo-find-your-grip.png`
   - Right card: INTRODUCING tag + "Rubber Tracks" / "Upgrade your construction equipment with MAXAM's rubber tracks." / Explore Rubber Tracks → `/products/rubber-tracks` over `/images/promo-rubber-tracks.jpg`
   - **Status:** ✓ done.

2b. **Industries grid** — `RubberIndustryCard` via `getAllIndustries`
   - 10 tiles incl. TBR and Rubber Tracks (matches WP count)
   - **Status:** ✓ done.

3. **Testimonials** — 3 `RubberTestimonialCard` in `ContentGrid columns={3}` (no slider, per design decision)
   - Data: `getAllTestimonials(locale)` filtered to non-empty quotes, slice 3
   - View all → `/testimonials` *(broken link — page not built)*
   - **Status:** ✓ section done. **TODO:** build `/testimonials` page.

4. **Featured Products** — `RubberProductCard` × 4
   - WP-picked tires by slug: `agrixtra-85`, `ms453`, `ms600`, `ms709` (matches WP homepage ACF repeater)
   - Falls back to `getFeaturedProducts(locale, 4)` if any slug missing in locale snapshot
   - **Status:** ✓ done.

5. **Sustainability strip** — `RubberSustainabilityStrip`
   - Heading "Sustainable Tire Development" + WP lead/body copy + Learn More CTA
   - BG: `/images/bg-sustainability.jpg` (forest)
   - CTA → `/sustainability` *(broken link — page not built)*
   - **Status:** ✓ section done. **TODO:** build `/sustainability` page (was `/ecopoint3/` on WP — verify which slug we want).

6. **Resource Center / "More Resources"** — `RubberArticleCard` × 3 via `getRecentArticles(locale, 3)`
   - WP has hand-picked articles (EcoPoint's effect on heat buildup, When Should You Replace Tractor Tires?, When should you replace solid OTR tires?); ours shows the 3 most recent
   - Heading "Resource Center" + WP lead "MAXAM Tire is a global leader…"
   - **Status:** ⚠ section done with auto-pick. **Optional:** wire WP's hand-picked article slugs explicitly if curation matters.

7. **Newsletter CTA / "Join Our Network"** — `RubberNewsletterCTA`
   - Email input + Subscribe button, full-bleed blue gradient over `/images/bg-newsletter.jpg`
   - **Status:** ✓ section done. **TODO:** wire form submission (Phase 4D form handling).

**Outstanding work tied to homepage (not blocking):**
- [ ] Build `/sustainability` page (was `/ecopoint3/` on WP; pick canonical slug)
- [ ] Build `/testimonials` page (testimonial CPT extracted, just needs a list page)
- [ ] Build `/why-maxam` (About) page so the hero CTA can repoint there
- [ ] Wire newsletter form to a real endpoint (Netlify Forms? backend? deferred to Phase 4D)
- [ ] Optional: wire Resource Center to WP's hand-picked article slugs instead of recent-by-date

---

## 2. Products hub — `/products/` (or `/tires/`)

**Purpose:** browse all tires with filtering; entry point to industry pages.

**Sections:**

1. **Hero** (`block_hero.php`) — "All Tires" title + intro
2. **Tire index / product listing** (`block_tire_index.php`)
   - Left sidebar (filters) + main grid
   - Per card: thumbnail, title, subheading, industry tags (colored), application icons, details snippet, Learn More
   - Filtering: WPC Product Filter plugin shortcodes (`[fe_widget]`, `[fe_open_button]`, `[fe_chips]`)
   - Query: `tire` post type, ordered by title ASC, 12 per page
   - Pagination: `wp_pagenavi`
   - Our equivalent: ✓ exists with custom client-side filter — needs RubberChip integration for the filter chips

3. **Footer**

---

## 3. Industry hub — `/[industry-slug]/` (e.g. `/agricultural-tires/`)

**Purpose:** industry-specific product showcase; marketing intro + product grid grouped by application.

**Sections:**

1. **Hero** (`block_hero.php` or industry-specific variant)
   - Industry name as title
   - Background image and overlay color from term meta

2. **Industry intro / overview**
   - Marketing copy describing the industry's product category
   - May use `block_industries_home.php` patterns

3. **Products grouped by application** (`block_tires_industry.php`)
   - Each application = a section with the application name as heading (anchor link)
   - Tire cards in flexbox grid beneath
   - Queries `tire-industry` + `tire-application` together
   - Industry color applied throughout
   - Our equivalent: ✓ already grouped by application; missing the intro/overview copy

4. **Footer**

---

## 4. Product detail — `/products/[industry]/[tire-slug]/`

**Template:** `single-tire.php`

**Sections:**

1. **Breadcrumb** (hardcoded in template) — Tires > Industry > Tire name

2. **Hero — two-column custom layout (not a block)**
   - **Left:** breadcrumbs, industry badges (colored), application icons (expandable), title, subheading, details/description, optional special logo
   - **Right:** tire gallery carousel (Slick fade with dot navigation)
   - ACF: `subheading`, `details`, `special_logo`, `tire_gallery_images` (repeater)
   - Industry color applied to slider controls

3. **CTA bar** — black section with "Get in Touch" headline + Contact Us button anchored to #form

4. **Features & Benefits** (`block_tires_featured.php` variant)
   - 2-col grid of feature items
   - Background image with industry-color overlay
   - ACF: `features` repeater
   - Heading: `features_benefits_heading` (global option)
   - Background image: `background_image_features_benefits` (term meta)

5. **Technical specifications table** — shortcode-rendered from `tire_specifications_table` ACF field; trailing notes from `additional_details`

6. **Contact form section** — Gravity Form ID 2 hardcoded; dark background, centered

7. **Downloads section**
   - Images: `tire_gallery_images` (lightbox + downloadable)
   - Documents: `tire_documents` (relationship to brochure CPT)
   - Each shows thumb + title link

8. **Back button** — links back to industry page

**Our equivalent:** product detail page exists with breadcrumb, chips, NotionBlocks body, document cards, CTA, back button. Missing: **two-column hero with gallery on the right** (currently the body is rendered linearly via NotionBlocks).

---

## 5. Resources hub — `/news/` or `/resources/`

**Template:** page using `block_resources_index.php`

**Sections:**

1. **Hero** (`block_hero.php`)
2. **Resource index with filters**
   - Filter bar: post type (All / Blog / News / Events / Product Sheets / Brochures) + industry category
   - Featured resource: large card (hidden when filter active)
   - Grid: cards for posts, news, events, brochures, product-sheets
   - Each card: thumbnail, title, excerpt, date, content type, read more
   - Cross-post-type query ordered by date DESC
   - AJAX filter
3. **Footer**

**Note:** WP labels `post` type as "Technical Bulletin" (custom logic in the block).

**Our equivalent:** ✓ exists; filter bar uses RubberChips now; featured-resource card pattern is **missing**.

---

## 6. Article / resource detail

**Template:** `single-news.php` (handles news, blog posts, and most other resource types)

**Special logic:** "In the News" items 301-redirect to their external `article_link`.

**Sections:**

1. **Hero — full-bleed image background with overlay content**
   - Category label, title (h1), publication date
   - Background: featured image or `bg_image` ACF
   - Overlay: semi-transparent, logo mark at bottom

2. **Content** (`block_post_content.php`)
   - If `legacy_content` is set → constrained single-column wysiwyg
   - Otherwise → ACF blocks
   - Option: large font for first paragraph

3. **Related resources** (`block_resource_center_features.php`)
   - Grid of resource cards (thumbnail, title, excerpt, meta, read more)
   - Per-post: `section_heading`, `subheading`, `resources` relationship
   - Global fallback: `global_resource_center_*` options
   - "View All Resources" button

4. **Global CTA** (`block_global_cta_network.php`) — optional Gravity Form ID 1

5. **Footer**

**Our equivalent:** article detail exists with breadcrumb, type chip, hero image, NotionBlocks body, back button. **Missing:** related-resources section, global CTA section.

---

## 7. Contact — `/contact/`

**Template:** `page.php` with ACF blocks

**Sections:**

1. **Hero** (`block_hero.php`) — "Get in Touch" + intro
2. **Contact form** (`block_content_form.php`)
   - 2-col: left text + heading, right Gravity Form
   - Background color configurable
3. **Office locations / network** (likely `block_3_column_special.php` or repeater)
   - Office addresses, contact per location
4. **Testimonials** (optional, `block_testimonial_slider.php` or `block_testimonials_columns.php`)
5. **Footer**

**Our equivalent:** ✓ contact page exists with form (rubbermorphic) and RubberOfficeCards. Missing: testimonials section + global CTA.

---

## 8. Footer (global)

**Template:** `footer.php`

**Structure:**

1. **Logo + social** (left col) — `footer_logo` ACF + `footer_social` HTML
2. **Products menu** (center col) — `footer_products_menu_label` + `footer_products_nav()` output
3. **Copyright + legal** (bottom row) — `footer_copyright_notice` ACF
4. **Secondary footer menu** (bottom row) — `footer_nav()` output

**Layout:** flexbox 3-column for logo/social + products + menu, copyright separate below.

**Our equivalent:** ✓ footer exists in rubbermorphic dark treatment. **Missing:** social links, real menu items beyond Contact/Resources/Products.

---

## 9. Navigation / mega menu

**Header** (`header.php`):
- Inline SVG MAXAM wordmark
- Primary nav: `header_nav()` from `header-menu` location
- WPML language selector
- Search modal trigger

**Mega menu includes** (`includes/tire-industries-menu*.php`) — 8 separate industry mega-menu files:
- Agricultural Tractor, Underground Mining, TBR, Forestry, OTR, Solid OTR, Industrial Forklift, Rubber Tracks

**Inferred top-level structure:**
- Products > industry pages
- Resources > resource types
- Company > About, Contact, etc.
- Language selector (3 languages)

**Our equivalent:** ✓ RubberHeader with mega-nav exists. Has Products + Resources. **Missing:** Company menu, search modal, secondary footer-style menu items.

---

## Content type inventory

### Custom post types in use
| Type | Template | What it is |
|---|---|---|
| `tire` | `single-tire.php` | Product |
| `news` | `single-news.php` | News article (press, in-the-news) |
| `post` | `single-news.php` | Blog / technical bulletin |
| `brochure` | `single-brochure.php` | PDF brochure |
| `product-sheet` | `single-product-sheet.php` | PDF spec sheet |
| `event` | `single-event.php` | Trade show / event |
| `special` | (custom) | Promotional tire campaigns w/ color override |
| `compliance` | `single-compliance.php` | Compliance / cert doc |
| `testimonial` | (referenced in blocks) | Customer testimonials |

### Taxonomies
- **tire-industry** (~17 terms) — primary product categorization. Term meta: `industry_color`, `industry_image`, `industry_landing_page`, `background_image_features_benefits`
- **tire-application** — use cases; term meta has application icons
- **tire-size**, **tire-type** — secondary
- **news-type**, **category** — used for resource filtering

---

## The 37 reusable ACF block components

| Block | Purpose | Layout |
|---|---|---|
| `block_hero` | Page hero, headline + content | Full-bleed centered |
| `block_industries_home` | Industry grid | 3–4 col cards |
| `block_tires_industry` | Products by application | Grouped sections + grid |
| `block_tire_index` | Product index with filters | Sidebar + grid |
| `block_tires_featured` | Featured product carousel | Paired slick sliders |
| `block_product_preview` | Small product grid (hardcoded) | 3+ col grid |
| `block_testimonial_slider` | Testimonial carousel (single item) | 2-col fade |
| `block_testimonial_slider_simple` | Testimonial carousel (simple) | Single col |
| `block_testimonials_columns` | Testimonial cards | 2-col grid |
| `block_testimonial_single` | Single testimonial | Static |
| `block_logos` | Logo gallery | 1–4 col |
| `block_resources_index` | Resource hub with filters | Sidebar + grid |
| `block_resource_center_features` | Related resources | 3-col grid |
| `block_tires_ecopoint` | Sustainability/eco info | TBD |
| `block_industry_applications` | Application showcase | TBD |
| `block_content_grid` | Generic content grid | 2–4 col |
| `block_content_slider` | Content carousel | Slick slider |
| `block_2_column_image` | 2-col image + text | Split |
| `block_3_column_special` | 3-col full-bleed | Colored columns |
| `block_faqs` | FAQ accordion | Single col |
| `block_content_form` | Form + text section | 2-col |
| `block_post_content` | Wysiwyg content | Centered, constrained |
| `block_post_cta` / `_large` | Post-level CTA | TBD |
| `block_global_cta_network` | Global CTA/network | Full-width |
| `block_video`, `_gallery` | Video embed/gallery | Centered/grid |
| `block_section`, `_anchor`, `_gap`, `_hr` | Layout utilities | Various |
| `block_wrapper_start`, `_end` | Layout wrappers | Utility |
| `block_specials_hero`, `_top_promo`, `_details` | Specials page sections | TBD |

---

## Pages WP has, we don't have routes for

Suggest reviewing each and deciding whether it ports to Phase 4 or later:

1. **Brochures / Catalogs hub** — downloadable literature index (could be a filter on Resources)
2. **Events / Trade Shows** — calendar of industry events (we have Events data, no page)
3. **Sustainability / Environmental Stewardship** — green initiatives, `block_tires_ecopoint.php`
4. **Compliance / Certifications** — regulatory docs (small content set in our extraction)
5. **About / Company** — company info page
6. **Testimonials hub** — full list of customer testimonials (we have data, no page)
7. **Media / Press kit** — press releases, logos, brand guidelines
8. **Dealer / Distributor locator** — interactive location finder (was there one?)
9. **Blog** — distinct blog archive (vs news/resources)
10. **Specials / Promotions** — seasonal tire campaigns (uses `special` post type)

**My recommendation for Phase 4 priority:** About, Sustainability, Testimonials hub. Specials, dealer locator, careers can wait.

---

## Global ACF options (site-wide)

Site-wide content in WP options. In Astro these become a single config/data file.

- `favicon`, `favicon_retina_display`
- `global_search_text`, `global_keywords_here_text`, `global_close_text`
- `site_wide_header_code`, `site_wide_body_code`, `site_wide_footer_code` (analytics)
- `footer_logo`, `footer_social`, `footer_products_menu_label`, `footer_copyright_notice`
- `global_read_more_text`, `global_learn_more_link`, `global_view_applications`
- `global_back_to_button_text`, `global_view_all_testimonials_link`, `global_next_link`
- `global_featured_post_text`, `global_no_results_found_text`
- `global_cta_content`, `global_cta_background_image`, `global_cta_gravity_form`
- `global_resource_center_section_heading`, `global_resource_center_subheading`, `global_resource_center_featured_resources`, `global_resource_center_view_all_button_text`
- `global_filter_by_text`, `global_all_tires_text`
- Tire-specific labels: `tire_application_label`, `tire_features_benefits_heading`, `tire_downloads_label`, `tire_product_images_label`, `tire_brochures_label`, `technical_specification_table_label`

Many of these are already in our translation files (`src/data/translations/`). The rest should land in `src/data/config.ts` or extend the translation system.

---

## Plugins / WP dependencies (for context, not migration targets)

- ACF Pro — field groups + block registration
- WPML — multi-language (we replicate this with our own i18n)
- Custom Post Type UI — CPT/taxonomy management
- Gravity Forms — contact forms (IDs 1, 2 hardcoded)
- WPC Product Filter — tire filtering (our custom JS replaces this)
- Slick Carousel — JS carousel (we'll need our own carousel component)
- Bootstrap grid — CSS framework (we use Tailwind v4)

---

## What Phase 4 needs to build

Based on this audit, here's the work to reach parity:

### New section components (rubbermorphic)
- **RubberHeroSection** — full-bleed background + overlay + heading + CTA (we have `Hero.astro` but it predates the rubbermorphism vocabulary)
- **RubberLogoGrid** — partner/brand logo strip with configurable column count
- **RubberFeatureSlider** — paired image+text Slick-style carousel for featured products
- **RubberTestimonialSlider** — single testimonial cycling carousel (uses `RubberTestimonialCard`)
- **RubberFAQ** — accordion list
- **RubberStatsBar** / value-props strip — 3-up icon + heading + text blocks
- **RubberGlobalCTA** — full-width CTA section with optional form embed
- **RubberResourceCenterStrip** — "related resources" 3-up card grid (uses RubberArticleCard)
- **RubberContent2Col** — 2-column image + text section
- **RubberContent3ColSpecial** — 3-column full-bleed (colored)
- **RubberVideoEmbed** — video player with poster image

### New pages to build
- **About / Company** — needs content extraction from WP page
- **Sustainability** — needs `block_tires_ecopoint.php` content
- **Testimonials hub** — uses existing testimonials data + new layout
- (Possibly) Brochures hub, Events hub, Specials

### Page rebuilds in rubbermorphism vocabulary
- **Homepage** — add testimonial slider, featured tires slider, logo strip, global CTA
- **Industry hub** — add intro paragraph + apply RubberChips for application headings
- **Product detail** — restructure as 2-column hero (gallery right, info left) + features section + CTA + downloads + back
- **Resources hub** — add featured-resource card pattern
- **Article detail** — add related resources + global CTA sections
- **Contact** — add optional testimonials section

### Global polish
- **Footer** — add social links, real menu items
- **Header** — add Company menu, search modal
- **Site config** — port the global ACF options as a config file or extend translations

---

## What this audit is NOT

- It's not a 1:1 visual copy — we're using rubbermorphism, not the WP theme's design language
- It's not exhaustive on every page — some niche pages (compliance/specials) get a one-line summary; we audit deeper if we decide to port them
- It does not include carousel JS — when a section uses a carousel we note it, but the implementation is our choice (Swiper, Embla, or pure CSS)
