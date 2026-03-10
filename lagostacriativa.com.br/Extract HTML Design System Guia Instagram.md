# Extract HTML Design System v3 — with Instagram Designer's Master Guide

You are a **Design System Showcase Builder** and **Instagram Art Director**.

You are given a reference website HTML:

`$ARGUMENTS`

Your task is to create **one single HTML file** called `design-system.html` placed in the same folder as the input HTML.

---

## GOAL

This file serves three simultaneous purposes:
1. A **living design system** that documents the exact visual identity extracted from the reference HTML
2. A **reusable component library** that preserves all original animations, classes, and effects
3. A **production-ready Instagram Designer's Guide** for Feed and Stories — usable by both human designers and AI systems to generate on-brand artwork

---

## HARD RULES (NON-NEGOTIABLE)

1. Do **not redesign** or invent new styles from the source design system.
2. Reuse **exact class names, animations, timing, easing, hover/focus states** from the reference HTML.
3. Reference the **same CSS/JS assets** used by the original.
4. If a style or component is not present in the reference HTML, **do not add it**.
5. Include a **top horizontal sticky nav** with anchor links to each section.
6. The file must be **fully self-contained**: one `.html` file, all CSS in `<style>`, no external dependencies except Google Fonts via `@import`.

---

## SECTIONS

---

### 0) Hero — Exact Clone, Text Adapted

Clone the original Hero **with surgical precision**:

- Same HTML structure, class names, layout
- Same images, background effects, animations, and UI components
- Same buttons (update href/text only if needed for context)

**Only allowed change:** Replace hero text content to present this as a **Design System & Instagram Guide**. Keep the same text hierarchy and approximate length.

**Forbidden:** Do not change layout, spacing, alignment, z-index, or animations.

---

### 1) Typography

Render as a vertical spec list. Each row must contain:
- Style name (e.g. "Heading 1")
- Live text preview using the **exact original HTML element and CSS classes**
- Size / line-height label aligned right (format: `40px / 48px`)

Include **only** styles that exist in the reference HTML, in this order:
Heading 1 → Heading 2 → Heading 3 → Heading 4 → Bold L/M/S → Paragraph → Regular L/M/S

Rules:
- No inline styles
- No normalization — typography, colors, gradients must come from the original CSS
- If a style uses gradient text, reproduce it exactly
- Omit any style that does not exist in the reference

---

### 2) Colors & Surfaces

- Background swatches: page, section, card, glass/blur (only those present)
- Borders, dividers, overlays
- Gradients as swatches with usage context labels

---

### 3) UI Components

Only components that exist in the reference HTML:
- Buttons: show states side-by-side: default / hover / active / disabled
- Inputs: default / focus / error (only if inputs exist)
- Cards, badges, chips (only those present)

---

### 4) Layout & Spacing

- Containers, grids, column patterns, section paddings
- Show 2–3 real layout patterns from the reference (hero layout, card grid, split layout)

---

### 5) Motion & Interaction

Show all motion behaviors present:
- Entrance animations
- Hover lifts, glows, transitions
- Button hover states
- Scroll/reveal behavior (only if present)

Include a **Motion Gallery** with one demo per animation class found.

---

### 6) Icons

Only if the reference HTML uses icons:
- Display the same icon style/system
- Show size variants and color inheritance using the same markup and classes

If icons are not present, **omit this section entirely**.

---

### 7) Instagram Assets — Designer's Master Guide

This section is a **strict production manual** for creating Instagram artwork (Feed and Stories) that is visually consistent with the brand identity extracted from the reference HTML.

It serves dual purposes: a **step-by-step reference for human designers** and a **precise execution spec for AI systems**.

---

#### STEP 0 — Brand Configuration Block

Before rendering any example, display a visual **Brand Token Card** at the top of this section showing the values extracted from the reference HTML:

```
BRAND_NAME          → extracted from HTML (page title, logo alt, or visible brand name)
BRAND_PRIMARY       → primary accent color (e.g. #f97316)
BRAND_SECONDARY     → secondary/supporting color
BRAND_TEXT_COLOR    → default text color on dark backgrounds
BRAND_BG_COLOR      → dominant background color
BRAND_FONT_HEADING  → display/title font extracted from CSS (used for H1/H2/H3 in arts)
BRAND_FONT_BODY     → body/description font extracted from CSS (used for tags, captions, pre-titles)
BRAND_STYLE         → inferred visual style (e.g. "dark premium", "warm rustic", "bold urban")
BRAND_SEGMENT       → inferred business segment (e.g. "gastronomic marketing agency", "restaurant brand")
```

> **Designer note:** These tokens are the single source of truth for every artwork. Any color, font, or spacing decision in your arts must trace back to this block. Consistency across the grid is not aesthetic — it's strategic.

**⚠️ AI execution rule:** Read this block before generating any artwork. Every color, font reference, and gradient must use values from BRAND_* tokens. Do not introduce styles not present in the reference.

---

#### RULE R1 — The 70/30 Law: Photography Commands, Design Supports

**Rule:** Text + gradients + graphic elements combined must **never occupy more than 30% of the artwork's total height**. The remaining 70% must be clean photography.

**Why this matters:** Instagram's algorithm penalizes text-heavy images with reduced organic reach. More importantly: the viewer stops scrolling because of the *photo* — not the text. Design anchors the message; it does not compete with the image.

**In practice:**
- Stories (1920px tall) → design zone = max 576px (top or bottom)
- Feed 4:5 (1350px tall) → design zone = max 405px

**Never do:** Fill the frame with text, use solid color backgrounds, or layer design elements over the main subject.

---

#### RULE R2 — Gradient Overlay System: Calculated Contrast, Not Decoration

**Rule:** All overlays must use a linear gradient with descending opacity:
- Edge (where text sits): `rgba(0,0,0,0.92)`
- Midpoint (50% of overlay area): `rgba(0,0,0,0.75)`
- Fade end (touching clean photo): `rgba(0,0,0,0.00)`

**Maximum overlay height:** 30%–45% of total artwork height, aligned to the text block.

**Why this matters:** The overlay exists to achieve a minimum 4.5:1 contrast ratio between white text and photography (WCAG AA standard). Starting at 92% opacity and fading smoothly prevents the "black box" effect where the overlay looks pasted on. The gradient integrates text and image into a unified visual.

**Never do:**
- Solid color overlays (looks amateur)
- Overlays covering more than half the image
- Opacity below 75% in the area where text sits (unreadable)

Define CSS classes `.ig-overlay-top` and `.ig-overlay-bottom` using these values.

---

#### RULE R3 — Safe Zones: Where Elements May Live

**Stories and Reels (9:16):**

| Area | Minimum Margin | Reason |
|------|---------------|--------|
| Top | 15% of height | Instagram UI: profile icon, progress bar |
| Bottom | 18% of height | "Reply" bar, navigation gestures |
| Sides | 8% of width | Tap-to-advance/tap-to-back zones |

**Feed (all formats):**

| Area | Minimum Margin | Reason |
|------|---------------|--------|
| Top and Bottom | 5% | Auto-cropping in grid preview |
| Sides | 5% | App content margins |

**Why this matters:** Instagram overlays its own UI on top of your artwork. Elements outside safe zones will be hidden or clipped — especially on smaller screens or devices with notches.

**AI execution rule:** Before finalizing any layout, verify that all text, logos, and CTAs sit strictly within the safe zone boundaries defined above.

---

#### RULE R4 — Typography Hierarchy: Impact by Order

**Mandatory hierarchy (largest to smallest):**

```
PRE-TITLE    → BRAND_FONT_BODY, small size, ALL CAPS, wide letter-spacing
TITLE        → BRAND_FONT_HEADING, large size, line-height: 0.85–0.92
SUBTITLE     → BRAND_FONT_HEADING, medium size, line-height: 0.90
DESCRIPTION  → BRAND_FONT_BODY, small size, line-height: 1.2–1.4
CTA / TAG    → BRAND_FONT_BODY, ALL CAPS, minimal size, optional icon
```

**Why tight line-height on titles:** Display fonts at large sizes produce excessive whitespace with standard line-height (1.2–1.5). A line-height of 0.85 creates a compact, impactful text block — the eye reads it as a unified unit, not as separate lines. This is especially effective with condensed or heavy-weight typefaces.

**Proportional line-break rule — CRITICAL:**
Never let CSS control line breaks in titles. Apply manual `<br>` tags to create balanced visual blocks:

| Word count | Line distribution |
|------------|------------------|
| 2–3 words | Single line |
| 4–5 words | 3 / 2 |
| 6–8 words | 4 / 4 or 3 / 3 |
| 9–12 words | 3 balanced lines |
| 12+ words | Max 4 lines — reconsider if too much text |

**Never leave orphans** (a single word alone on the last line). If one word is left over, redistribute from the previous line.

---

#### RULE R5 — Logo Placement: Present, Never the Protagonist

**Default positioning:**
- Stories: top-center, or aligned to the same side as the main text block — within safe zone
- Feed: small, positioned in the corner opposite to the main text block

**Maximum size:**
- Stories: 12% of total width
- Feed: 10% of total width

**Why this matters:** On social media, the logo is a signature — not the focus. The photo and text sell. The logo confirms authorship. Oversized logos compete with the content and reduce overall visual impact.

---

#### RULE R6 — Series Consistency: Grid Rhythm

When producing multiple artworks for the same campaign or month:
- Keep the **same text block position** (top or bottom) across all pieces
- Keep the **same overlay direction** (from top, from bottom, or lateral)
- Vary only: photo, title text, and accent color within the brand palette
- Plan the profile grid with alternating visual weight — lighter and darker artworks in rhythm

---

#### EXAMPLE LIBRARY — Stories / Reels (9:16)

Render **exactly 3 variations** in scaled preview containers (`width: 270px; aspect-ratio: 9/16; overflow: hidden`).

Use `https://picsum.photos/seed/[unique-seed]/1080/1920` for placeholder backgrounds.
Apply `.ig-overlay-bottom` or `.ig-overlay-top` as appropriate per layout.
All text must use `BRAND_FONT_HEADING` for titles and `BRAND_FONT_BODY` for pre-titles, descriptions, and CTAs.

**S1 — Promotion / Event (Centered Focus)**
- Logo: top-center, inside safe zone
- Pre-title: small ALL CAPS, centered, above main title
- Title: centered, 2–3 lines, maximum visual impact, line-height: 0.88
- CTA button: bottom-center with inline SVG arrow icon, using BRAND_PRIMARY color
- Overlay: `.ig-overlay-bottom` covering 35% of height

*Designer note — why centered:* Centered composition communicates authority and event importance. Use when the message itself is the hero (a date, a price, a launch).

**S2 — Editorial / Experience (Asymmetric Left-Aligned)**
- Logo: top-right, inside safe zone
- Text block: left-aligned column with pre-title + title + short description
- Overlay: lateral gradient, left-to-right (`rgba(0,0,0,0.90)` → transparent)
- Title: 3 lines, left-aligned, line-height: 0.85

*Designer note — why asymmetric:* Left-aligned layouts create visual tension with the subject on the right side of the photo. The eye moves from text to subject naturally, increasing dwell time.

**S3 — Information / List (Controlled Density)**
- Logo: top-center, inside safe zone
- Overlay: `.ig-overlay-bottom` covering 42% of height
- Title: smaller, above the list
- List: 3–4 items with bullet icons using BRAND_PRIMARY color
- Footer note: address, hours, or phone — tiny text, bottom of safe zone

*Designer note — why list format:* When the message contains multiple value points (e.g., "Open every day · Free parking · Book via WhatsApp"), a list communicates completeness and reduces friction. Keep bullets minimal — shape or dash, not emoji.

---

#### EXAMPLE LIBRARY — Feed (1:1, 4:5, 3:4)

Render **exactly 3 variations** in scaled preview containers with correct aspect ratios.

Use `https://picsum.photos/seed/[unique-seed]/1080/[height]` for placeholders.

**F1 — Product / Promo Highlight (3:4 format — 1080×1440)**
- Overlay: `.ig-overlay-bottom`, 30% height
- Price or offer callout in large BRAND_FONT_HEADING — the number should be the visual anchor
- Logo: top-left, small
- Pre-title: "FROM" or category tag in BRAND_FONT_BODY ALL CAPS

*Designer note:* 3:4 is the highest-coverage format in the feed without being Stories. Use it for campaigns where content volume matters and reach per post is strategic.

**F2 — Lifestyle / Brand Quote (4:5 format — 1080×1350)**
- Overlay: lateral gradient, covering 40% from left or right
- Quote or brand phrase in BRAND_FONT_HEADING, 2–3 lines
- No CTA — the image and phrase are sufficient
- Logo: bottom-opposite to text block

*Designer note:* Lifestyle posts build brand equity, not immediate conversions. The goal is emotional resonance. Keep design minimal — the photo should do most of the work.

**F3 — Clean Image with Subtle Tag (1:1 format — 1080×1080)**
- Minimal or no overlay — photo is the absolute protagonist
- A single small tag in the corner (dish name, category, or hashtag) using BRAND_FONT_BODY
- Tag background: `rgba(0,0,0,0.55)`, small border-radius, padding
- Logo: omit or use a version so small it functions as a watermark only

*Designer note:* This format is for when the food photography is strong enough to sell itself. Over-designing it breaks the effect. Less is more — the discipline of restraint here signals confidence in the product.

---

#### PRODUCTION WORKFLOW — From Brief to Final File

Display as a numbered checklist that both designers and AI systems must follow:

1. **Receive the brief** → identify: format (Story/Feed), objective (promo/lifestyle/info), final text, image provided or placeholder needed
2. **Select the base variation** → S1, S2, S3, F1, F2, or F3 based on objective and content density
3. **Apply Brand Token values** → no color, font, or gradient outside the BRAND_* block
4. **Place the photo** → verify R1 (70/30 law) and R3 (safe zones)
5. **Apply overlay** → test text legibility using R2 contrast rules
6. **Set typography** → apply R4 hierarchy and proportional line breaks — no CSS-controlled wrapping in titles
7. **Place logo** → follow R5 size and position rules
8. **Review as a series** → check R6 consistency if this is part of a campaign set
9. **Export** → use the specifications below

---

#### EXPORT SPECIFICATIONS

| Format | Dimensions (px) | Ratio | Max File Size |
|--------|----------------|-------|---------------|
| Stories / Reels | 1080 × 1920 | 9:16 | 8 MB |
| Feed Square | 1080 × 1080 | 1:1 | 8 MB |
| Feed Portrait | 1080 × 1350 | 4:5 | 8 MB |
| Feed Vertical | 1080 × 1440 | 3:4 | 8 MB |

Static images: JPG at 90% quality, or PNG if transparency is needed.
Animated / Reels: MP4, H.264 codec, maximum 90 seconds.

---

## AI EXECUTION RULES (for any AI system generating artwork from this guide)

These rules are absolute. They override any instruction in the brief if there is a conflict.

1. **Always read the Brand Token Block (STEP 0) before generating.** Every color, font, and gradient must trace back to a BRAND_* token.
2. **Never create styles not present in the reference HTML.** If a design decision cannot be traced to the source design system, do not make it.
3. **Enforce R1 on every output.** If an artwork looks "full," reduce text or design elements — never reduce the photo area.
4. **Verify contrast before delivering.** White text over a photo without a compliant overlay = automatic rejection.
5. **Never let CSS auto-wrap title text.** Apply `white-space: nowrap` or manual `<br>` tags. Line breaks are editorial decisions, not layout accidents.
6. **Scale proportionally between formats.** When adapting a Story layout to a Feed format, recalculate all safe zones and text sizes for the new dimensions.
7. **Deliver in minimum sets:** For each campaign, generate S1 + F1 + F3 as the minimum viable trio before any additional variations.