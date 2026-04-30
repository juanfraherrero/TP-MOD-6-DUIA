# Design System Inspired by Linear — Full Reference

> Referencia completa del sistema. El SKILL.md de esta carpeta tiene la versión condensada para uso diario; este documento es para casos donde necesites specs exactos (sombras multi-layer, variantes raras de input, breakpoints completos, etc.).

## 1. Visual Theme & Atmosphere

Linear's design system embodies a minimalist, sophisticated approach to product development interfaces. The visual language prioritizes clarity and precision with a dark-mode-first aesthetic that reduces cognitive load during intense focus work. Deep blacks and near-blacks form the foundation, accented by cool grays and a subtle indigo accent that provides depth without distraction. The system is intentionally sparse and purposeful — every element serves function, creating an environment where AI-assisted workflows and human collaboration can coexist seamlessly. Typography is clean and modern, using variable-weight Inter for flexibility across scales, while monospace Berkeley Mono grounds technical content. Generous whitespace and restrained color usage reflect a workspace designed for sustained concentration and precision.

**Key Characteristics**

- Dark-mode dominant with carefully calibrated neutral scale.
- Minimalist, distraction-free interface aesthetic.
- Cool, professional color palette emphasizing clarity.
- Precise typographic hierarchy supporting AI workflows.
- Intentional use of micro-interactions and subtle elevation.
- High contrast between interactive and passive elements.
- Designed for teams and autonomous agents working in parallel.

## 2. Color Palette & Roles

### Primary

- **Brand Primary** (`#5E6AD2`): Primary interactive accent, used sparingly for key CTAs and status indicators in AI-driven workflows.
- **Brand Accent Light** (`#828FFF`): Secondary accent for hover states and supporting interactive elements.

### Interactive

- **Button Default** (`#8A8F98`): Neutral button text for secondary actions.
- **CTA Background** (`#E5E5E6`): Light neutral background for prominent call-to-action buttons.
- **Link Active** (`#5E6AD2`): Primary link color and interactive focus state.

### Neutral Scale

- **Surface Darkest** (`#08090A`): Deepest background layer for modals and overlays.
- **Surface Dark** (`#0F1011`): Primary dark surface for content containers.
- **Surface Base** (`#141516`): Secondary dark surface layer.
- **Surface Gray Mid** (`#23252A`): Tertiary neutral for dividers and subtle backgrounds.
- **Surface Gray** (`#383B3F`): Lighter gray for secondary text and borders.
- **Surface Text Secondary** (`#62666D`): Secondary text color, used for supporting copy (most frequently used).
- **Surface Text Tertiary** (`#8A8F98`): Tertiary text for disabled or muted states.
- **Surface Border Light** (`#B4BCD0`): Light border for subtle separation in dark mode.

### Surface & Borders

- **Surface Light** (`#F7F8F8`): Primary light background for cards and containers (most-used token).
- **White** (`#FFFFFF`): Pure white for maximum contrast and primary text in light contexts.
- **Border Default** (`#D0D6E0`): Primary border color for light surfaces.
- **Border Subtle** (`#E2E4E7`): Subtle border for reduced visual weight.
- **Border Lighter** (`#E5E5E6`): Lightest border for minimal separation.

## 3. Typography Rules

### Font Family

- **Primary**: Inter Variable (400, 510, 590 weights) — fallback `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.
- **Secondary**: Berkeley Mono (400 weight) — fallback `"SF Mono", Monaco, "Cascadia Code", monospace`.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|-----------------|-------|
| Display 1 | Inter Variable | 64px | 510 | 64px | 0px | Hero headlines, main page titles |
| Display 2 | Inter Variable | 48px | 510 | 48px | 0px | Section headlines, major headings |
| Heading 3 | Inter Variable | 20px | 590 | 26.6px | 0px | Card titles, subsection heads |
| Heading 4 | Inter Variable | 16px | 590 | 24px | 0px | Form labels, emphasis text |
| Body | Inter Variable | 15px | 400 | 24px | 0px | Primary body copy, descriptions |
| Body Span | Inter Variable | 16px | 400 | 24px | 0px | Secondary body, content blocks |
| Link | Inter Variable | 14px | 510 | 21px | 0px | Navigation links, inline links |
| Button | Inter Variable | 13px | 400 | 19.5px | 0px | Button labels, small actions |
| Code Small | Berkeley Mono | 12.25px | 400 | 15.925px | 0px | Inline code, technical references |
| Code | Berkeley Mono | 14px | 400 | 24px | 0px | Code blocks, technical content |

### Principles

- Weight `510` = semi-bold para nav y subheadings.
- Weight `590` = small scannable headings y form labels.
- Weight `400` = todo el body content (accesibilidad).
- Mantener `24px` line-height en body para legibilidad en dark mode.
- Monospace solo para code, identifiers, technical variables.
- Leading scale entre `1.0` y `1.6×` del base size.
- Letter-spacing siempre `0px` — appearance limpio y moderno.

## 4. Component Stylings

### Buttons

#### Primary Button

- **Background**: `#E5E5E6`
- **Text Color**: `#08090A`
- **Font Size**: `13px`
- **Font Weight**: `510`
- **Padding**: `0px 12px`
- **Height**: `32px`
- **Border Radius**: `9999px`
- **Border**: `1px solid #E5E5E6`
- **Box Shadow** (L2): `rgba(0,0,0,0) 0 8px 2px 0, rgba(0,0,0,0.01) 0 5px 2px 0, rgba(0,0,0,0.04) 0 3px 2px 0, rgba(0,0,0,0.07) 0 1px 1px 0, rgba(0,0,0,0.08) 0 0 1px 0`
- **Line Height**: `19.5px`
- **Hover**: shadow más intenso, background un poquito más oscuro.

#### Secondary Button (Ghost)

- **Background**: `transparent`
- **Text Color**: `#8A8F98`
- **Font Size**: `13px`
- **Font Weight**: `400`
- **Padding**: `0px 12px`
- **Height**: `32px`
- **Border Radius**: `9999px`
- **Border**: ninguno
- **Box Shadow**: ninguna
- **Hover**: text → `#B4BCD0`.

#### Navigation Button

- **Background**: `transparent`
- **Text Color**: `#F7F8F8`
- **Font Size**: `16px`
- **Font Weight**: `400`
- **Padding**: `0`
- **Height**: `72px`
- **Border Radius**: `0`
- **Hover**: text → `#B4BCD0`.

### Cards & Containers

#### Dark Card

- **Background**: `#0F1011`
- **Text Color**: `#F7F8F8`
- **Font Size**: `16px`
- **Font Weight**: `400`
- **Padding**: `0px 24px 28px 24px`
- **Border Radius**: `8px`
- **Border**: `1px solid rgba(255,255,255,0.05)`
- **Box Shadow**: ninguna
- **Min Height**: `440px`
- **Max Width**: `328px`
- **Line Height**: `24px`

#### Navigation Container

- **Background**: `transparent`
- **Text Color**: `#F7F8F8`
- **Height**: `72px`
- **Width**: `100%`
- **Border Radius**: `0`
- **Box Shadow**: `rgba(0,0,0,0.4) 0px 1px 0px 0px`

### Inputs & Forms

#### Text Input Dark

- **Background**: `rgba(255,255,255,0.02)`
- **Text Color**: `#D0D6E0`
- **Font Size**: `13.3333px`
- **Font Weight**: `400`
- **Padding**: `12px 14px`
- **Border Radius**: `6px`
- **Border**: `1px solid rgba(255,255,255,0.08)`
- **Box Shadow**: `rgba(0,0,0,0.2) 0px 0px 0px 1px`
- **Min Height**: `32px`
- **Focus**: border `#5E6AD2`, shadow más prominente.

#### Search Input

- **Background**: `transparent`
- **Text Color**: `#F7F8F8`
- **Font Size**: `16px`
- **Padding**: `1px 32px`
- **Border Radius**: `0`
- **Border**: ninguno
- **Box Shadow**: ninguna
- **Height**: `64px`
- **Placeholder**: `#62666D`

#### Code Input

- **Background**: `transparent`
- **Text Color**: `#000000` (rendering transparente para code highlighting)
- **Font Size**: `14px`
- **Font Family**: `Berkeley Mono`
- **Padding**: `0px 32px 0px 56px`
- **Border Radius**: `0`
- **Min Height**: `432px`
- **Line Height**: `24px`

### Navigation

#### Header Navigation

- **Background**: `transparent`
- **Text Color**: `#F7F8F8`
- **Font Size**: `16px`
- **Height**: `72px`
- **Display**: `flex`
- **Align Items**: `center`
- **Box Shadow**: `rgba(0,0,0,0.4) 0px 1px 0px 0px`
- **Padding**: `0px 24px`

#### Navigation Link

- **Background**: `transparent`
- **Text Color**: `#F7F8F8`
- **Font Size**: `14px`
- **Padding**: `0px 8px`
- **Border Radius**: `6px`
- **Height**: `32px`
- **Hover**: bg `rgba(255,255,255,0.05)`, text `#B4BCD0`.

### Links

#### Primary Link / CTA Link

- **Background**: `#5E6AD2`
- **Text Color**: `#FFFFFF`
- **Font Size**: `14px`
- **Font Weight**: `510`
- **Padding**: `0px 16px`
- **Border Radius**: `0px`
- **Height**: `32px`
- **Hover**: bg `#6B7BFF`.

#### Secondary Link

- **Background**: `transparent`
- **Text Color**: `#8A8F98`
- **Font Size**: `13px`
- **Padding**: `0px 12px`
- **Border Radius**: `9999px`
- **Height**: `32px`
- **Hover**: text `#B4BCD0`.

## 5. Layout Principles

### Spacing System

**Base**: `4px`. Toda dimensión es múltiplo.

`4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 36 · 40 · 48 · 52` (px).

**Usage**:

- Padding botón: `12px` H.
- Padding input: `12–14px`.
- Padding card: `24px` standard, `32–48px` para hero.
- Gap flex/grid: `8–12px` compact, `24–40px` content blocks.
- Margin entre sections: `20–52px`.

### Grid & Container

- **Max width**: hasta `1440px` para full-width components.
- **Columnas**: 1 (mobile) → 2 (tablet) → 3+ (desktop). Cards en grid de 3 col @ desktop con `328px` max-width c/u.
- **Hero**: full width, texto centrado, nav header `72px`.
- **Cards**: `8px` border-radius, `1px` border sutil.
- **Sidebar**: secciones colapsables (workspace/favorites).

### Whitespace Philosophy

Linear usa whitespace agresivo. Dark surfaces son el negative space; tratalo como elemento de diseño. Margins grandes (`52px+`) entre sections. Padding interno `24–32px` dentro de containers. Texto nunca apretado — line-heights y letter-spacing mantienen ritmo cómodo.

### Border Radius Scale

- `4px` — controles densos.
- `6px` — inputs, form controls, small interactive.
- `8px` — cards, containers, bloques principales.
- `9999px` — pill (botones de nav y secondary).
- `50%` — avatares, circle icons.

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| **Base (L0)** | sin shadow, surface plana | UI default, cards, primary containers |
| **Raised (L1)** | `rgba(0,0,0,0.4) 0 1px 0 0` | Nav headers, separación sutil de containers en focus |
| **Elevated (L2)** | `rgba(0,0,0,0) 0 8px 2px 0, rgba(0,0,0,0.01) 0 5px 2px 0, rgba(0,0,0,0.04) 0 3px 2px 0, rgba(0,0,0,0.07) 0 1px 1px 0, rgba(0,0,0,0.08) 0 0 1px 0` | Primary buttons, modales, floating panels |
| **Deep (L3)** | Stack multi-layer con blur extra | Dropdowns, tooltips, overlays |

**Filosofía**: Linear usa shadows multi-layer con opacidades distintas para profundidad natural sin contraste duro. L2 es para elementos que demandan prominencia visual (primary buttons, modales). En dark mode, pure-black-on-black no funciona; por eso la mayoría de capas usan top-border `1px` o shadows muy sutiles. La elevación es funcional (indica interactividad/state), no decorativa.

## 7. Do's and Don'ts

### Do

- Usá `#5E6AD2` con moderación — solo CTA primary y high-priority.
- `#F7F8F8` como standard light bg en cards (mejor contraste que pure white).
- `24px` line-height en body para legibilidad dark.
- Weight `510` para énfasis semi-bold en nav y subheadings.
- `8px` border-radius en cards e inputs (consistencia).
- Pill (`9999px`) para botones de nav y secondary.
- Dark surface (`#0F1011`) + light text (`#F7F8F8`) — WCAG AA.
- `#8A8F98` y `#62666D` reservados para secondary/disabled/supporting.
- L2 multi-layer shadow exclusivamente para primary buttons y modales.
- Padding generoso (`24–32px`) dentro de containers.

### Don't

- **No uses pure black** (`#000000`) para texto — usá `#08090A` o `#F7F8F8`.
- `#E5E5E6` (button bg) **NO** es color de texto general.
- No le metas shadow a cualquier elemento interactivo — L2 solo para primary y modales.
- No mezcles serif con Inter/Berkeley Mono.
- No te excedas de `8px` de radius excepto pills (`9999px`).
- No mezcles múltiples accent colors — un primary action por pantalla.
- `border-radius: 0px` solo en nav headers, search inputs y full-width components.
- No te pases de `32px` de padding en cards típicas.
- No uses `#62666D` ni `#8A8F98` sobre dark cuando necesitás contraste alto.
- No le metas background a inline text links.

## 8. Responsive Behavior

### Breakpoints

| Breakpoint | Width | Key Changes |
|-----------|-------|-------------|
| Mobile | `< 640px` | 1 col, full-width cards, nav → hamburger, hero a 48px (h2) |
| Tablet | `640–1024px` | 2 col grid, sidebar condensado, button sizing igual |
| Desktop | `1024–1440px` | 3 col grid, nav full visible, hero 64px, gaps `40px+` |
| Large | `> 1440px` | Container max `1440px` centrado, márgenes extendidos |

### Touch Targets

- Mínimo: `44 × 44px`.
- Recomendado mobile: `48–56px` height.
- Spacing entre targets: ≥ `8px`.
- Nav items: `32px` desktop / `48px` mobile.
- Inputs: `32px` desktop / `48px` mobile.

### Collapsing Strategy

- **Nav**: header `72px` → hamburger drawer en tablet → vertical stack en mobile.
- **Cards**: 3 col `328px` → 2 col 50% → 1 col full minus `16px` margin.
- **Hero**: 64px → 48px → 20px.
- **Padding**: `24px` → `16px` → `12px`.
- **Margins verticales**: `52px` → `32px` → `20px`.
- **Tipografía**: tamaños fijos por hierarchy; line-heights consistentes.

## 9. Quick Reference — Iteration Guide

1. **Texto sobre dark = `#F7F8F8` o `#FFFFFF`** (WCAG AA). `#62666D` solo para no-crítico.
2. **Tres tipos de botón únicos**: Primary (CTA bg + L2), Secondary ghost (transparent + `#8A8F98`), Navigation (transparent + `#F7F8F8` + radius `0`).
3. **Card base = `#0F1011`** + border `1px solid rgba(255,255,255,0.05)` + padding `0px 24px 28px 24px`.
4. **Font stack: Inter Variable** (400/510/590) para UI; **Berkeley Mono** solo para code/identifiers (12.25 / 14px).
5. **Spacing en múltiplos de 4** — sin excepciones.
6. **Radius ∈ {4, 6, 8, 9999}px** — sin valores arbitrarios.
7. **Shadows = L1 (top-border) o L2 (multi-layer)** — nunca ambas.
8. **Forms: radius `6px`** + border `rgba(255,255,255,0.08)` + bg `rgba(255,255,255,0.02)`.
9. **Nav header siempre `72px`** + L1 + text `16px` Inter + radius `0`.
10. **Mobile = `< 640px`**, tablet `640–1024px`, desktop `1024–1440px`. Padding/margins escalan 33–50% en mobile.
