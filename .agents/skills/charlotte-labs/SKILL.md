---
name: charlotte-labs
description: Apply the Charlotte Labs design system when styling components, creating new UI, or matching the existing demo app's visual direction. Triggers on "Charlotte Labs", "bone and slate", "demo design", "Charlotte style", or when styling any component in this project.
---

# Charlotte Labs Design System

Use this skill whenever you are creating, editing, or styling components in a Charlotte Labs project. It encodes the exact visual direction of the current demo app: bone-and-slate palette, warm neutral cards, subtle shadows, and domain-specific components (fluency pills, tool badges, provenance vial).

## Core rule

Never hardcode color values (e.g. `text-white`, `bg-[#...]`, arbitrary hex). All colors must come from `src/styles.css` semantic tokens or from the utility classes listed below. This preserves both light and dark modes and keeps the demo's distinctive warm-neutral look.

## Tailwind v4 setup

This project is on Tailwind v4. Design tokens live in `src/styles.css` via `@theme inline`, not in `tailwind.config.js`. The project uses `@import "tailwindcss" source(none);` plus `@source "../src";`.

Keep any new design tokens in `src/styles.css` under `@theme inline` and define the actual values in `:root` and `.dark`.

## Color tokens

The project has two palettes: the **Bone + Slate** app UI and the **Brand** marketing colors.

### App UI (semantic tokens)

| Token | Light value | Dark value | Use |
| --- | --- | --- | --- |
| `--background` | `hsl(36 25% 96%)` (#F7F5F2) | `hsl(220 55% 8%)` | Page background |
| `--foreground` | `hsl(40 12% 14%)` (#2a2820) | `hsl(220 20% 95%)` | Body text |
| `--card` | `hsl(0 0% 100%)` | `hsl(220 55% 13%)` | Card surfaces |
| `--card-foreground` | `hsl(40 14% 11%)` | `hsl(220 20% 95%)` | Card text |
| `--primary` | `hsl(40 9% 21%)` (#3a3830) | `hsl(204 100% 77%)` | Primary buttons, key actions |
| `--primary-foreground` | `hsl(45 32% 78%)` (#D8D0B8) | `hsl(210 60% 17%)` | Text on primary |
| `--secondary` | `hsl(36 22% 91%)` (#EEEAE4) | `hsl(220 55% 15%)` | Secondary buttons, tags |
| `--secondary-foreground` | `hsl(40 14% 11%)` | `hsl(220 20% 95%)` | Text on secondary |
| `--muted` | `hsl(36 18% 84%)` (#DDD8D0) | `hsl(220 30% 25%)` | Muted backgrounds |
| `--muted-foreground` | `hsl(42 13% 50%)` (#908870) | `hsl(220 15% 65%)` | Placeholder, helper text |
| `--accent` | `hsl(120 8% 41%)` (#607060) | `hsl(204 97% 65%)` | Accent surfaces, hover states |
| `--accent-foreground` | `hsl(0 0% 100%)` | `hsl(210 60% 17%)` | Text on accent |
| `--border` | `hsl(36 18% 84%)` | `hsl(220 30% 25%)` | Dividers, borders |
| `--ring` | `hsl(120 8% 41%)` | `hsl(204 100% 77%)` | Focus rings |

### Brand colors (marketing/banner accents)

These are defined as one-off hex utilities:

- `--brand-navy`: `#0B2A4A`
- `--brand-mint`: `#6FFAC6`
- `--brand-cream`: `#F4F9F9`

Use them via `bg-brand-navy`, `text-brand-mint`, `bg-brand-cream`, etc.

## Typography

- **Body**: `DM Sans` (loaded via `src/routes/__root.tsx` Google Fonts link).
- **Code/pre**: `JetBrains Mono`.
- Apply in `src/styles.css`:
  ```css
  body { font-family: 'DM Sans', system-ui, sans-serif; }
  code, pre { font-family: 'JetBrains Mono', monospace; }
  ```
- Headings: `tracking-tight`, `font-semibold` or `font-bold`. H1 is typically `text-3xl font-semibold tracking-tight` on participant pages.
- Body: `text-sm text-muted-foreground` is the standard helper style.

## Radius and shape

- `--radius: 0.625rem`.
- Cards: `rounded-xl`.
- Buttons: `rounded-md`.
- Tags/badges: `rounded-full`.
- Use `border` plus `shadow` or `shadow-sm` on cards; do not use heavy shadows.

## shadcn component variants

### Button (`src/components/ui/button.tsx`)

Use the existing variants:

- `default`: `bg-primary text-primary-foreground shadow hover:bg-primary/90`
- `outline`: `border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground`
- `secondary`: `bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80`
- `ghost`: `hover:bg-accent hover:text-accent-foreground`

For demo CTAs (bright, attention-grabbing), the app uses **amber buttons** inline rather than the primary variant, e.g.:

```tsx
className="bg-amber-400 font-semibold text-amber-950 hover:bg-amber-300"
```

This is an intentional exception for "Play Demo" / tour entry points. Keep the rest of the UI on semantic tokens.

### Card (`src/components/ui/card.tsx`)

Standard card: `rounded-xl border bg-card text-card-foreground shadow`. Header uses `p-6`, content uses `p-6 pt-0`. Keep this structure; do not flatten padding unless the design demands it.

## Domain-specific components

These are the Charlotte-specific visual patterns. Reuse them rather than inventing new styles.

### Fluency level pills

Defined in `src/styles.css` as utility classes:

- `.fluency-advanced` — green-tinted: `#EDF4E0` bg, `#2a4a10` text, `#C8DCA8` border
- `.fluency-strong` — blue-tinted: `#E8EEF8` bg, `#1a3a7c` text, `#C0D0EC` border
- `.fluency-developing` — yellow-tinted: `#F8F4E4` bg, `#7a5a10` text, `#E0D090` border
- `.fluency-researching` — warm gray: `#F0EDE8` bg, `#6a5838` text, `#D8CCA8` border

These are semantic color exceptions; use them exactly for fluency level chips.

### Tool badges

Tool color classes in `src/styles.css`:

- `.tool-chatgpt` — `#EDF4E0` / `#2a5a10`
- `.tool-claude` — `#F0EBF8` / `#5a2f90`
- `.tool-gemini` — `#E8EEF8` / `#1a3a7c`
- `.tool-copilot` — `#F0EBF8` / `#7a3a18`
- `.tool-perplexity` — `#E0F0F0` / `#1a5858`
- `.tool-default` — `#F0EDE8` / `#6a5838`

Use these via the `<ToolLogo>` component and the `toolLogos.ts` / `toolLabel()` helpers.

### Provenance vial

The lab-work vs. personal-tinkering indicator uses animated CSS variables and classes:

- Lab: neon green tokens (`--provenance-lab`, etc.)
- Personal: lavender tokens (`--provenance-personal`, etc.)
- Animation classes: `.vial-bubble`, `.vial-bubble-2`, `.vial-bubble-3`, `.vial-fill`

Do not replace the vial with a simple colored dot; keep the liquid-fill + bubble animation.

## Demo-specific patterns

### Demo bar / top banner

The demo environment banner uses `bg-brand-navy text-white` and contains bright, high-contrast demo entry points. Demo CTAs should use `bg-amber-400 text-amber-950` or similar amber accents so they stand out from the navy bar.

### Featured cards / "Start here" markers

For featured items (e.g. a featured receipt), use an amber/gold treatment:

- `border-amber-400/80`
- `bg-amber-50/60`
- `text-amber-900`
- Star icon (`<Star className="..." />`) + "Featured" badge

## Dark mode

The project supports `.dark` via the same semantic tokens. When adding new colors, you must provide both `:root` and `.dark` values. If you only add a light value, dark mode will break.

## What to avoid

- Generic purple/indigo gradients on white.
- Default Inter/Poppins-only aesthetics.
- Heavy shadows or large border-radius beyond what is already used.
- Hardcoded colors in component `className` strings.

## How to apply this skill

1. Read `src/styles.css` to see the current tokens and the light/dark values.
2. Prefer existing tokens for backgrounds, text, borders, and accents.
3. Use the exact domain component classes (fluency pills, tool badges) for their specific use cases.
4. Add new tokens only when a value genuinely does not exist yet, and always add both `:root` and `.dark` values.
5. Keep the demo's understated, warm, research-credible aesthetic — clean cards, generous whitespace, subtle color coding.
