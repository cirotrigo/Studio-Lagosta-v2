# Extract HTML Design System v2

You are a **Design System Showcase Builder**.
You are given a reference website HTML:

`$ARGUMENTS`

Your task is to create **one new intermediate HTML file** that acts as a **living design system + pattern library** for this exact design.

---

## GOAL

Generate **one single file** called: `design-system.html` and place it in the same folder of the html file.

This file must preserve the **exact look & behavior** of the reference design by **reusing the original HTML, CSS classes, animations, keyframes, transitions,effects, and layout patterns** — not approximations.

---

## HARD RULES (NON-NEGOTIABLE)

1. Do **not redesign** or invent new styles.
2. Reuse **exact class names, animations, timing, easing, hover/focus states**.
3. Reference the **same CSS/JS assets** used by the original.
4. If a style/component is not used in the reference HTML, **do not add it**.
5. The file must be **self-explanatory by structure** (sections = documentation).
6. Include a **top horizontal nav** with anchor links to each section.

---

## OBJECTIVE

Build a **single page** composed of **canonical examples** of the design system, organized in sections.

---

### 0) Hero (Exact Clone, Text Adapted)

The **first section MUST be a direct clone of the original Hero**:

- Same HTML structure
- Same class names
- Same layout
- Same images and components
- Same animations and interactions
- Same buttons and background
- Same UI components (if any)

**Allowed change (only this):**

- Replace the hero text content to present the **Design System**
- Keep similar text length and hierarchy

**Forbidden:**

- Do not change layout, spacing, alignment, or animations
- Do not add or remove elements

---

### 1) Typography

Create a **Typography section** rendered as a **spec table / vertical list**.

Each row MUST contain:

- Style name (e.g. “Heading 1”, “Bold M”)
- Live text preview using the **exact original HTML element and CSS classes**
- Font size / line-height label aligned right (format: `40px / 48px`)

Include ONLY styles that exist in the reference HTML, in this order:

- Heading 1
- Heading 2
- Heading 3
- Heading 4
- Bold L / Bold M / Bold S
- Paragraph (larger body, if exists)
- Regular L / Regular M / Regular S

Rules:

- No inline styles
- No normalization
- Typography, colors, spacing, and gradients MUST come from original CSS
- If a style uses gradient text, show it exactly the same
- If a style does not exist, do NOT include it

This section must communicate **hierarchy, scale, and rhythm** at a glance.

---

### 2) Colors & Surfaces

- Backgrounds (page, section, card, glass/blur if exists)
- Borders, dividers, overlays
- Gradients (as swatches + usage context)

---

### 3) UI Components

- Buttons, inputs, cards, etc. (only those that exist)
- Show states side-by-side: default / hover / active / focus / disabled
- Inputs only if present (default/focus/error if applicable)

---

### 4) Layout & Spacing

- Containers, grids, columns, section paddings
- Show 2–3 real layout patterns from the reference (hero layout, grid, split)

---

### 5) Motion & Interaction

Show all motion behaviors present:

- Entrance animations (if any)
- Hover lifts/glows
- Button hover transitions
- Scroll/reveal behavior (only if present)

Include a small **Motion Gallery** demonstrating each animation class.

---

### 6) Icons

If the reference uses icons:

- Display the **same icon style/system**
- Show size variants and color inheritance
- Use the **same markup and classes**

If icons are not present, omit this section entirely.

---

### 7) Instagram Assets: Designer's Master Guide

Create a comprehensive **Instagram Assets** section dedicated to social media design guidelines (Feed and Stories). This section must serve as a strict manual for designers, applying the visual strategies of the reference design.

**IMPORTANT REQUIREMENT:** Before rendering the examples, **prompt the user to provide 6 background images** (3 for Stories, 3 for Feed). Use these provided images for the examples below. If the user does not provide them, use relevant, high-quality placeholders, but you must ask first.

Include the following detailed guidelines and examples:

#### A. Layout & Safe Zones (2026 Rules)
- **Stories & Reels (9:16):** 
  - Margin Top: min 15%
  - Margin Bottom: min 18%
  - Margin Sides: min 8%
  - *All text elements and logos MUST stay strictly within this safe zone.*
- **Feed Formats:** Highlight the 3:4 (1080x1440) feed layout as the optimized choice, alongside classic 1:1 and 4:5.
- **Overall Limitation:** Text and gradients combined should **never occupy more than 30%** of the total artwork height. The remaining 70% must be clean photography.

#### B. Gradient Overlay System (CSS Contrast)
- Define a linear gradient overlay (`.ig-overlay-top` and `.ig-overlay-bottom`) that transitions from black to transparent.
- **Opacity constraint:** Start at 95% opacity, hold 80% opacity until the half of the gradient area, and then fade out quickly.
- **Height constraint:** The overlay must cover a maximum of 30-45% of the height, aligning perfectly with the text blocks.

#### C. Typography & Text Wrapping Rules (CRITICAL)
- **Fonts:** Use 'Coolvetica' for main Titles (H1, H2, H3), and 'Yanone Kaffeesatz' for descriptions, tags, and pre-titles.
- **Line Heights:** Use aggressively tight line-heights for titles (`line-height: 0.85;` or `leading-none`) to create solid text blocks. For descriptions, use `leading-none` or `leading-snug`.
- **Text Wrapping Logic (Proportional Breaks):** Designers must break lines proportionally to create balanced visual blocks. Implement manual `<br>` tags based on word count.
  - *Example 1 (9 words in 2 lines):* Implement 5 words on the top line, 4 words on the bottom line.
  - *Example 2 (9 words in 3 lines):* Implement exactly 3 words per line.
  - *Rule:* Avoid "orphans" (single words on a line). Always balance the character weight.

#### D. Branding & Icons
- **Logo:** Keep the logo small but readable, placed centrally at the top or aligned to the dominant text side. Let it breathe within the safe zone.
- **Icons:** Use minimal SVG icons (e.g., location pins, arrows) inside CTA buttons or address lines. Ensure they share the color mapping of the brand (mostly white or primary accent color).

#### E. Examples Library
Generate the HTML implementation for:
1. **Story & Reels (9:16):** exactly **3 diverse variations**:
   - Centered Focus (Promotion/Event)
   - Asymmetric Left-Aligned (Editorial/Experience)
   - Text-Heavy Quote/List (Information density balanced)
2. **Feed (1:1 and 3:4/4:5):** exactly **3 diverse variations**:
   - Product/Promo Highlight (3:4)
   - Lifestyle/Brand Quote (4:5)
   - Clean Image with subtle overlay tag (1:1)