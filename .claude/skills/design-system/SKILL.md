---
name: design-system
description: Use when adding or modifying any UI in this TP DUIA project — pages under src/app/, components under src/components/, layouts, forms, chat bubbles, modals, buttons, inputs, navigation, or anything visual. Enforces the "Cinematic Glass" design system: full-bleed photo backgrounds with frosted-glass floating panels (hero card, chips, chat input bar) for atmospheric/landing screens, and warm off-white solid surfaces (`#FAFAF7`) for content-dense screens (admin, forms, dashboard). The app is **light-only** — the theme toggle has been removed and `<ThemeProvider>` forces `data-theme="light"`; dark tokens stay defined for future re-activation. Brand color is institutional green (`brand-primary` #0F7A4A — replaces the previous indigo). Two surface families coexist: `glass-{bg,border,highlight,shadow}` (single locked recipe — bg 6% white, blur 24px, border 12% white, inset highlight + drop shadow) and `surface-{primary,secondary,tertiary,overlay}` solids. Text on glass uses pure white at opacity steps (100/70/60/50); text on solid uses semantic tokens (`text-primary/secondary/tertiary/muted`). Three CTA recipes share the same `h-10 px-4 rounded-xl` base so they align in rows: `.btn-primary-cta` (solid green), `.btn-outline-cta` (green outline), `.btn-secondary` (ghost). The legacy `.btn-primary` (h-8 dark pill) is kept only for non-branded functional controls (file upload trigger). Branded chip pattern (`bg-brand-primary/10 text-brand-primary border border-brand-primary/20`) is the canonical shape for active nav state, status pills, and "AI" affordance. Typography is Inter Variable (400/510/590/600) + Berkeley Mono. 4px spacing grid; radius scale `4/6/8/12/16/20/9999` (12/16/20 reserved for glass + CTA buttons). Apply whenever editing JSX/TSX with className or style props, or restyling existing UI. The full reference is in DESIGN.md (same folder) — load it for exact glass recipes, breakpoints, drop-shadow specs, the token-to-CSS map, and the admin shell pattern (sticky translucent header + brand stripe).
---

# Design system — TP DUIA (Cinematic Glass)

UI inspirada en paisajes de La Rioja: **fotografía full-bleed** como héroe, paneles flotantes de **vidrio esmerilado** con una sola receta consistente, acento **verde institucional** únicamente en CTA. Para vistas densas en contenido (admin, chat extendido) hay un sistema **sólido warm off-white** que comparte tipografía, grid y disciplina con el glass.

> **Referencia completa**: `DESIGN.md` en esta misma carpeta. Cargala cuando necesites specs exactos (token map, drop-shadow del título, breakpoints, recetas glass detalladas, admin shell).
> **Sistema anterior** (Linear-inspired, indigo): preservado en `DESIGN-OLD.md` para referencia histórica.

## La idea central

Dos familias de superficie conviven:

1. **Glass** — para pantallas atmosféricas con foto de fondo (landing, hero, empty states). **Una sola receta**: bg blanco 6%, `blur(24px)`, border blanco 12%, inset highlight superior + drop shadow exterior. Cambia solo el `border-radius` por componente.
2. **Solid (light-only)** — para vistas densas (admin, formularios, dashboard). Light = warm off-white `#FAFAF7`. Los tokens son **semánticos** (`surface-primary`, `text-primary`), no literales.

**La app es light-only.** El toggle de tema fue removido y `<ThemeProvider>` fuerza `data-theme="light"` siempre, ignorando el `prefers-color-scheme` del SO. Los tokens dark siguen definidos en `globals.css` por si en el futuro se reactiva — no los borres. Glass es theme-agnostic (siempre white con baja opacity — funciona porque está sobre foto).

## La regla load-bearing

**Una sola receta de glass por pantalla.** Si el hero card es bg 6% / blur 24, los chips y el input bar también. Lo que falló en la versión anterior del landing fue mezclar opacidades y radios distintos — el panel se ve como sticker pegado en vez de material.

## Tokens canónicos

### Brand (constantes — no flipean)

```
brand-primary       #0F7A4A   ← verde institucional, único en CTA primary visible
brand-accent        #16A06A   ← hover/focus del CTA
brand-deep          #0A5C38   ← active/pressed
```

### Glass (transparentes — sin modificador `/X`)

```
glass-bg              rgba(255,255,255,0.06)   ← panel sobre foto luminosa
glass-bg-strong       rgba(255,255,255,0.08)   ← bg de chips (más definidos)
glass-bg-hover        rgba(255,255,255,0.10)   ← hover de chips/buttons glass
glass-border          rgba(255,255,255,0.12)   ← border de paneles
glass-border-strong   rgba(255,255,255,0.18)   ← border de chips
glass-highlight       rgba(255,255,255,0.15)   ← inset top (refracción)
glass-shadow          0 24px 60px rgba(0,0,0,0.25)    ← exterior del hero card
glass-shadow-sm       0 8px 24px rgba(0,0,0,0.20)     ← input bar y chips floating
```

### Text-on-glass (solo white + opacity)

```
text-glass             rgba(255,255,255,1)      ← títulos
text-glass-secondary   rgba(255,255,255,0.70)   ← subtítulos
text-glass-muted       rgba(255,255,255,0.60)   ← eyebrow, links secundarios
text-glass-placeholder rgba(255,255,255,0.50)   ← input placeholder
```

### Solid surfaces theme-aware (light → dark)

```
surface-primary     #FAFAF7 → #0F1011   ← background de página solid
surface-secondary   #F2F1EC → #141516   ← cards, panels, modal container
surface-tertiary    #E8E6DD → #1A1B1E   ← hover bg
surface-overlay     #DEDDD3 → #08090A   ← code blocks / overlay máximo
```

> Light mode ya **no es blanco puro** — es warm off-white `#FAFAF7` que armoniza con la paleta ocre de la foto. Evita el "salto a blanco quirúrgico" en la transición hero → chat.

### Solid text theme-aware (light → dark)

```
text-primary        #08090A → #F7F8F8
text-secondary      #5E5852 → #A8A29A   ← warmer than antes
text-tertiary       #8A847C → #8A847C
text-muted          #383530 → #B8B0A4
text-on-cta         #FFFFFF → #FFFFFF   ← siempre white sobre verde
```

### Borders solid (rgba theme-aware)

```
border-soft     rgba(0,0,0,0.06) → rgba(255,255,255,0.05)
border-medium   rgba(0,0,0,0.10) → rgba(255,255,255,0.08)
border-strong   rgba(0,0,0,0.14) → rgba(255,255,255,0.14)
```

### State colors (theme-aware)

```
warning             #B47D1A → #F0C674
warning-bg          #FAE6B4 → #3A2E1C
warning-border      #E8D199 → #5E4A26
danger              #C92A2A → #E5484D
danger-hover        #B91C1C → #FF6369
danger-bg           rgba(201,42,42,0.08) → rgba(229,72,77,0.10)
info                #0F7A4A → #16A06A   ← ahora green-tinted (alineado con marca)
info-bg             rgba(15,122,74,0.08) → rgba(22,160,106,0.12)
info-border         rgba(15,122,74,0.20) → rgba(22,160,106,0.25)
```

**Cuándo usar cada estado**

- **warning** — error recuperable (validation, fetch retry, SQL preview rechazado).
- **danger** — solo destructivo (DeleteButton, "Borrar conversación").
- **info** — paneles informativos / hints / ragNotes. Verde translúcido — **no confundir con CTA**: info nunca usa `bg-brand-primary` puro.

### Typography

- **UI**: Inter Variable, weights `400 / 510 / 590 / 600`. Fallback `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.
- **Code**: Berkeley Mono, weight 400. Solo para SQL, identifiers, code blocks.

| Rol | Size | Weight | LH | Uso |
|---|---|---|---|---|
| Hero Title | 44px | 600 | 52px | Hero glass card. **Drop-shadow obligatorio sobre foto** |
| Display 1 | 64px | 600 | 64px | Hero en superficies sólidas |
| Display 2 | 48px | 590 | 56px | Section headers |
| Heading 3 | 20px | 590 | 26.6px | Card titles |
| Heading 4 | 16px | 590 | 24px | Form labels |
| Body | 15px | 400 | 24px | Copy primario |
| Body Span | 16px | 400 | 24px | Subtítulos hero glass |
| Eyebrow | 11px | 510 | 14px | Uppercase, `tracking-[0.12em]` |
| Link | 14px | 510 | 21px | Nav links |
| Button | 13px | 510 | 19.5px | Labels (peso 510, no 400 — sobre verde necesita densidad) |
| Code | 14px | 400 | 24px | Code blocks |
| Code small | 12.25px | 400 | 15.925px | Inline code |

- Hero title: `tracking-tight` (-0.02em) + `text-shadow: 0 2px 12px rgba(0,0,0,0.4)` cuando va sobre foto. Sobre solid no lleva shadow.
- Eyebrow siempre `uppercase` + `tracking-[0.12em]`.
- Letter-spacing default `0px`.

### Spacing — grid de 4px

`4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 36 · 40 · 48 · 56 · 64 · 80` (px). **Cualquier padding/margin debe ser múltiplo de 4.**

Convenciones:
- Hero card padding: `48px`.
- Botón padding horizontal: `16px`.
- Input padding: `12–14px`.
- Solid card padding: `24px` (default), `32px` (grandes).
- Gap entre chips: `12px`.
- Gap eyebrow → title → subtitle → chips: `24 / 16 / 32px`.
- Bottom-anchor del input bar: `32px`.

### Border radius

| Token | Value | Use |
|---|---|---|
| `rounded-sm` | 4px | Controles densos |
| `rounded-md` | 6px | Inputs solid, form controls |
| `rounded-lg` | 8px | Cards solid, containers |
| `rounded-xl` | 12px | **Primary CTA sobre glass** |
| `rounded-2xl` | 16px | **Glass input bar** |
| `rounded-[20px]` | 20px | **Hero glass card** |
| `rounded-full` | 9999px | Pills, chips, avatares |

> 12/16/20 son **solo para glass**. No usar para cards solid (esas siguen en 8).

### Elevación

| Nivel | Treatment | Cuándo |
|---|---|---|
| **L0** | sin shadow | UI default, cards solid |
| **L1** | `0 1px 0 0 rgba(0,0,0,0.4)` | Nav header en superficies sólidas |
| **L2** | multi-layer (ver DESIGN.md §6) | Modales solid + primary buttons solid |
| **L-glass** | `inset 0 1px 0 rgba(255,255,255,0.15), 0 24px 60px rgba(0,0,0,0.25)` | Hero glass card |
| **L-glass-sm** | `inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 24px rgba(0,0,0,0.20)` | Input bar glass, chips floating |

**Glass siempre lleva DOS capas**: inset top highlight (refracción) + drop shadow exterior. Sin las dos, el panel se ve plano y "pegado".

## Recetas de componentes (las que más vas a usar)

> **Helpers en `globals.css`** (cuando se implementen): `.glass-panel`, `.glass-chip`, `.glass-input`, `.btn-primary-cta`, `.input` (solid), `.card-solid`. Usalos por default.

### Photo hero container

```tsx
<section className="relative min-h-screen w-full">
  <Image src="/canyon-hero.webp" alt="" fill priority className="object-cover" />
  {/* Overlay obligatorio para legibilidad */}
  <div
    className="absolute inset-0 pointer-events-none"
    style={{
      background:
        "linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 35%, transparent 60%)",
    }}
  />
  <div className="relative z-10">{/* glass content */}</div>
</section>
```

### Hero glass card (la receta canónica)

```tsx
<div
  className="
    max-w-[720px] mx-auto
    rounded-[20px] p-12
    border border-glass-border
    bg-glass backdrop-blur-2xl backdrop-saturate-150
  "
  style={{
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.15), 0 24px 60px rgba(0,0,0,0.25)",
  }}
>
  <span className="block text-eyebrow uppercase text-white/60 mb-6 text-center">
    Gobierno de La Rioja · Turismo
  </span>
  <h1
    className="text-hero font-semibold text-white text-center tracking-tight"
    style={{ textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}
  >
    Agente de Turismo de La Rioja
  </h1>
  <p className="mt-4 text-body-span text-white/70 text-center max-w-[480px] mx-auto">
    Bienvenido al asistente inteligente para descubrir los encantos de La Rioja.
  </p>
  <div className="mt-8 flex flex-wrap gap-3 justify-center">{/* chips */}</div>
</div>
```

### Suggestion chip (glass pill)

```tsx
<button className="
  inline-flex items-center gap-2
  px-4 py-2.5 rounded-full
  bg-glass-strong border border-glass-border-strong
  text-white text-link
  backdrop-blur-xl
  hover:bg-glass-hover transition-colors
">
  <MapPinIcon className="size-3.5" />
  Talampaya
</button>
```

### Floating chat input bar (glass)

```tsx
<form
  className="
    fixed bottom-8 left-1/2 -translate-x-1/2 z-20
    w-[min(720px,calc(100%-32px))]
    flex items-center gap-2
    rounded-2xl px-3 py-2
    border border-glass-border
    bg-glass backdrop-blur-2xl
  "
  style={{
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 24px rgba(0,0,0,0.20)",
  }}
>
  <input
    placeholder="Escribí tu mensaje…"
    className="flex-1 bg-transparent border-0 outline-none px-3 py-2.5 text-white placeholder:text-white/50 text-body"
  />
  <button className="btn-primary-cta">
    <SendIcon className="size-4" />
    Enviar
  </button>
</form>
```

### Familia CTA — tres botones que comparten línea base

Para que primary + outline + ghost queden alineados cuando comparten fila (form footer, chat input, modal footer), las tres clases comparten **`h-10 px-4 rounded-xl text-button`**. Cambia solo bg/border/text.

```tsx
{/* Primary — el ÚNICO botón verde sólido por pantalla */}
<button className="btn-primary-cta">
  <SendIcon className="size-4" />
  Actualizar
</button>

{/* Outline — acción secundaria con afinidad de marca (ej: "Aumentar con IA") */}
<button className="btn-outline-cta">Aumentar con IA</button>

{/* Ghost — acción terciaria (ej: "Cancelar") */}
<button className="btn-secondary">Cancelar</button>
```

Recetas equivalentes (en `globals.css`):

| Clase | Background | Border | Text | Hover |
|---|---|---|---|---|
| `.btn-primary-cta` | `bg-brand-primary` | — | `text-white` | `bg-brand-accent`, active `bg-brand-deep` |
| `.btn-outline-cta` | transparent | `border-brand-primary/40` | `text-brand-primary` | `bg-brand-primary/[0.06]`, border 60% |
| `.btn-secondary` | transparent | — | `text-text-secondary` | `bg-surface-soft text-text-primary` |

> **Importante**: radius `12px` (`rounded-xl`), **no** pill. El pill chocaba con inputs rectangulares y rompía la grilla.

### `.btn-primary` (legacy) — ¿cuándo todavía sirve?

Es la clase vieja: `h-8 px-3 rounded-full bg-cta-bg shadow-l2` (dark, neutral). Solo en **controles funcionales no-marca** que conviven con un CTA verde en pantalla y no deben competir con él. Ejemplo concreto: el trigger del file upload en `ImageUploadBlock` — si fuera verde, robaría protagonismo al "Actualizar"/"Crear" del formulario. **No usar para acciones primarias nuevas.**

### Top nav (transparent over photo)

```tsx
<header className="absolute top-0 inset-x-0 z-20 h-18 px-6 flex items-center justify-between">
  <div className="flex items-center gap-3">
    <CoatOfArmsIcon className="size-8 text-white" />
    <span className="text-white text-link leading-tight">
      Gobierno<br />de La Rioja
    </span>
  </div>
  <nav className="flex items-center gap-8">
    <a className="text-white/80 hover:text-white text-link transition-colors">Servicios</a>
    <a className="text-white/80 hover:text-white text-link transition-colors">Noticias</a>
    <a className="text-white/80 hover:text-white text-link transition-colors">Portal Ciudadano</a>
  </nav>
</header>
```

### Solid card (post-hero, contextos densos)

```tsx
<div className="rounded-lg bg-surface-secondary border border-soft p-6">...</div>
```

### Solid text input (en contextos sólidos)

```tsx
<input className="
  w-full h-10 px-3.5 rounded-md
  bg-input border border-medium
  text-text-primary placeholder:text-text-tertiary
  focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/15
  transition-all
" />
```

### Branded chip (recipe canónica para affordances de marca sobre solid)

Es la receta que usan el active state del admin nav, las status pills "Activa" en la lista de actividades y los hovers de las suggestion chips de admin. Un único recipe tinted que comunica "esto está vinculado a la marca / es el state activo".

```tsx
<span className="
  inline-flex items-center gap-1.5
  h-6 px-2.5 rounded-full
  bg-brand-primary/10 text-brand-primary
  border border-brand-primary/20
  text-code-sm font-medium
">
  <span className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
  Activa
</span>
```

**Variantes**:
- Active nav link: `h-9 px-3 rounded-md bg-brand-primary/10 text-brand-primary border border-brand-primary/20`.
- Hover de chip secundaria: empieza neutral (`border-medium text-text-secondary`), al hover sube a `border-brand-primary/40 text-brand-primary bg-brand-primary/[0.04]`.

**No confundir con `<AIBadge>`** — el AIBadge tiene mono font + dot animado y es exclusivo para "esto lo escribió un agente". El branded chip es para state/status/nav activo.

### Admin shell (sticky translucent + brand stripe)

El admin layout usa un patrón "subtle glass on solid" — sticky header con backdrop-blur leve sobre superficie sólida (no es glass full sobre foto). Es el toque atmosférico que tira admin hacia el lenguaje del landing sin romper la legibilidad de pantallas densas.

```tsx
<header className="sticky top-0 z-30 bg-surface-primary/85 backdrop-blur-md border-b border-soft">
  <div className="max-w-container mx-auto h-18 px-6 flex items-center gap-10">
    <Link href="/admin/activities" className="flex items-center gap-3">
      <Image src="/images/icon-2.png" alt="La Rioja" width={120} height={32} className="h-7 w-auto" />
      <span className="hidden sm:inline-block h-5 w-px bg-border-medium" />
      <span className="hidden sm:inline text-link text-text-secondary">Admin</span>
    </Link>
    <AdminNav />
  </div>
  {/* Brand stripe — separator visual sutil */}
  <div className="h-[2px] bg-gradient-to-r from-transparent via-brand-primary/40 to-transparent" />
</header>
```

**Specs**

- `bg-surface-primary/85 backdrop-blur-md` — el 85% de opacidad + blur leve (12px) deja entrever lo que scrollea debajo, sin perder legibilidad. **No uses `backdrop-blur-2xl` acá** — eso es solo para glass over photo.
- Brand stripe `h-[2px]` con gradient transparente en los extremos — más elegante que un border sólido. Es el detalle que conecta admin con el landing.
- Wordmark de marca (`icon-2.png`, verde "LA RIOJA - Argentina") en `h-7` (28px). Si no tenés el wordmark a mano, usá el escudo o el lockup textual.
- Hairline divider (`h-5 w-px bg-border-medium`) entre wordmark y "Admin" — se oculta en mobile.

### Page header (admin pages — eyebrow + display title + subtitle)

Patrón de jerarquía de la página (afuera del shell). Va al tope de cada página densa para anclar contexto.

```tsx
<header className="space-y-2">
  {/* opcional: back-link breadcrumb */}
  <Link href="/admin/activities" className="inline-flex items-center gap-1.5 text-link text-text-secondary hover:text-brand-primary transition-colors">
    <span aria-hidden="true">←</span> Actividades
  </Link>
  <span className="block text-eyebrow uppercase text-text-tertiary mt-4">
    Catálogo · La Rioja
  </span>
  <h1 className="text-display-2 text-text-primary">Actividades</h1>
  <p className="text-body-span text-text-secondary max-w-xl">
    Gestioná las experiencias turísticas que el Agente recomienda.
  </p>
</header>
```

**Specs**

- Eyebrow: `text-eyebrow uppercase text-text-tertiary` — 11px tracked-wide, `text-text-tertiary` para que no compita.
- Title: `text-display-2` (48px / 590 / -0.01em) — más prominente que el viejo `text-h3`.
- Subtitle: `text-body-span text-text-secondary max-w-xl` — copy de soporte, ancho limitado.
- Back-link: arrow + label, `text-text-secondary hover:text-brand-primary`. Sin background, sin pill — minimal.

### Empty state con aurora glow sobre solid

Para empty states en pantallas sin foto (admin), usar un radial blur verde sutil en lugar de `<AuroraBackground />` cuando ya estás dentro de un card.

```tsx
<div className="relative overflow-hidden rounded-2xl border border-soft bg-surface-secondary px-8 py-16 text-center">
  <div className="absolute inset-0 -z-10 opacity-60">
    <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-80 w-80 rounded-full bg-brand-primary/[0.10] blur-[120px]" />
  </div>
  <h2 className="text-h3 text-text-primary">Todavía no hay actividades</h2>
  <p className="mt-2 mx-auto max-w-md text-body text-text-secondary">
    Cargá la primera experiencia y empezá a poblar el catálogo.
  </p>
  <Link href="/admin/activities/new" className="btn-primary-cta mt-6 inline-flex">
    + Crear actividad
  </Link>
</div>
```

## Reglas no-negociables

1. **Una sola receta de glass por pantalla.** bg, blur, border, shadow lockeados; solo varía radius.
2. **Brand green solo en el primary CTA visible** (`.btn-primary-cta`). Para acciones secundarias con afinidad de marca, usar `.btn-outline-cta`. Para state/status visual usar el branded chip recipe (`bg-brand-primary/10 text-brand-primary border border-brand-primary/20`) — esos NO son CTAs.
3. **Botones en fila comparten `h-10 px-4 rounded-xl text-button`.** Las tres clases (`btn-primary-cta`, `btn-outline-cta`, `btn-secondary`) están alineadas a propósito. No mezclar `h-8 rounded-full` con `h-10 rounded-xl` en la misma fila — desalinea visualmente (lección aprendida en el footer del activity form).
4. **Texto sobre glass = white + opacity** (100/70/60/50). Cero `text-text-secondary` sobre glass.
5. **Photo background necesita gradient overlay.** No negociable — sin él el input es ilegible.
6. **Hero title sobre foto = drop-shadow.** `text-shadow: 0 2px 12px rgba(0,0,0,0.4)`.
7. **Glass radius**: hero card `20`, input `16`, chip `9999`, send button `12`. Solid card sigue en `8`.
8. **No `bg-white` en contexto glass.** Forbidden — input, button, ningún panel.
9. **Send button sobre glass = `rounded-xl` (12px), no pill.** Pill choca con el input rectangular.
10. **Glass siempre con dos capas de shadow** (inset highlight + drop shadow). Sin las dos, se ve sticker.
11. **Tokens semánticos sí, hex literales no.** `bg-brand-primary`, `bg-glass`, `text-glass-secondary`. Nunca `bg-[#0F7A4A]`.
12. **Surface-primary light = `#FAFAF7`** (warm off-white). Nunca `bg-white` para página.
13. **Texto principal solid = `text-text-primary`** (semántico). Solo `text-white` sobre glass.
14. **App es light-only.** No agregues toggle de tema, no leas `prefers-color-scheme`. Si necesitás un tema oscuro, pedí discusión antes — los tokens dark están definidos pero no activos.
15. **Admin sticky header = `bg-surface-primary/85 backdrop-blur-md`**, no `backdrop-blur-2xl`. El blur fuerte es solo para glass-over-photo.
16. **Brand stripe (gradient verde) bajo el admin header** — no border sólido. Es el detalle de marca que conecta admin con el landing.
17. **Page header pattern** = eyebrow uppercase + `text-display-2` + body-span subtitle. No usés `text-h3` para títulos de página.
18. **Spacing múltiplo de 4.** `p-2.5` → no.
19. **Mobile glass blur = 16px** (no 24 — perf iOS Safari).
20. **No animaciones en `backdrop-filter`** — son brutales en perf.
21. **Mobile**: padding `24px` → `16px` → `12px`. Touch target mínimo `44×44px`.

## Anti-patterns frecuentes

Patrones del sistema anterior (Linear-inspired indigo) que hay que migrar cuando aparezcan, **más** los que aprendimos durante la migración:

- ❌ `bg-[#5E6AD2]` (indigo viejo) → ✅ `bg-brand-primary` (verde nuevo).
- ❌ `bg-white`, `bg-gray-50` como fondos de página → ✅ `bg-surface-primary` (warm off-white).
- ❌ `bg-black text-white` para botones primary → ✅ `bg-brand-primary text-white` (`.btn-primary-cta`).
- ❌ `text-gray-500/400/700` → ✅ `text-text-secondary` / `text-text-tertiary` / `text-text-primary`.
- ❌ `border`, `border-gray-200` → ✅ `border border-soft` o `border-medium`.
- ❌ `rounded` o `rounded-lg` random → ✅ `rounded-md` (6) / `rounded-lg` (8) / `rounded-xl` (12) / `rounded-2xl` (16) / `rounded-[20px]`.
- ❌ `text-sm`, `text-xs` → ✅ tamaños de la tabla tipográfica.
- ❌ `px-4 py-2` para botón → ✅ `h-10 px-4` (CTA) o `h-8 px-3` (legacy neutral) según contexto.
- ❌ Glass con una sola capa de shadow → ✅ siempre inset highlight + drop shadow.
- ❌ Mezclar opacidades de glass en la misma pantalla → ✅ una receta única.
- ❌ Pill (`rounded-full`) en botón send → ✅ `rounded-xl`.
- ❌ Botones, panels o inputs blancos sólidos sobre foto → ✅ todo glass.
- ❌ Hero title sin `text-shadow` sobre foto → ✅ `text-shadow: 0 2px 12px rgba(0,0,0,0.4)`.
- ❌ **`btn-primary` (legacy dark pill) en form footer al lado de `btn-outline-cta`** → ✅ Migrar a `btn-primary-cta` (verde, h-10 rounded-xl). Lección del activity edit: las tres clases tienen que compartir altura/radio.
- ❌ **Inline button class custom** con `h-8 px-3 rounded-full bg-transparent border border-brand-primary/30 text-brand-accent` → ✅ `.btn-outline-cta` (la clase canónica para outline verde).
- ❌ **`dot-grid` background en admin pages** → ✅ Solo en pantallas técnicas sin foto que necesiten textura. Sobre el warm off-white mete ruido visual; mejor dejar la página limpia.
- ❌ **Toggle de tema en cualquier lado** → ✅ App es light-only. Si necesitás reactivarlo, primero pedí discusión.
- ❌ **`prefers-color-scheme` en CSS o JS** → ✅ El SO no manda. `<ThemeProvider>` y `NO_FLASH_SCRIPT` fuerzan `light` siempre.
- ❌ **`text-h3` para títulos de página** → ✅ `text-display-2` con eyebrow + subtitle. `text-h3` es para cards/secciones, no headers de página.
- ❌ **Status pill con `bg-brand-primary/15 text-brand-accent`** (mezcla incoherente) → ✅ Branded chip recipe canónica: `bg-brand-primary/10 text-brand-primary border border-brand-primary/20`.

## Checklist antes de cerrar un cambio de UI

**Surface family**
- [ ] ¿La página tiene foto de fondo? Si sí: ¿hay gradient overlay obligatorio?
- [ ] Si hay glass: ¿todos los paneles glass de la página usan **la misma receta** (bg/blur/border/shadow)?
- [ ] Si es admin/dense: ¿usa warm off-white solid (`bg-surface-primary`) y no `bg-white`?
- [ ] ¿Glass tiene las dos capas de shadow (inset highlight + drop shadow)?

**Marca y CTAs**
- [ ] ¿Hay **un solo** primary CTA verde (`btn-primary-cta`) por pantalla?
- [ ] Si hay un secondary brand action (ej: "Aumentar con IA"), ¿usa `.btn-outline-cta`?
- [ ] ¿Las tres clases CTA en una fila comparten `h-10 rounded-xl`?
- [ ] ¿Los chips/status pills/active nav usan el branded chip recipe (`bg-brand-primary/10 text-brand-primary border border-brand-primary/20`)?

**Texto y tipografía**
- [ ] ¿El hero title sobre foto tiene `text-shadow`?
- [ ] ¿Texto sobre glass es `text-white/X` (no `text-text-*`)?
- [ ] ¿Texto sobre solid es `text-text-primary/secondary/tertiary` (semántico)?
- [ ] ¿Page header usa eyebrow + `text-display-2` + body-span subtitle?
- [ ] ¿Tipografía usa la escala (no `text-sm` random)?

**Layout y radius**
- [ ] ¿Spacing es múltiplo de 4?
- [ ] ¿Border-radius del componente glass es el correcto (hero 20 / input 16 / chip 9999 / send button 12)?
- [ ] ¿Solid card sigue en `rounded-lg` (8) o `rounded-2xl` (16) si necesita más presencia?
- [ ] ¿No hay `bg-white` ni hex literales en JSX?

**Admin shell**
- [ ] ¿El admin layout tiene sticky header con `bg-surface-primary/85 backdrop-blur-md`?
- [ ] ¿Está el brand stripe verde abajo del header?
- [ ] ¿AdminNav muestra el active state (branded chip)?

**Mobile / perf**
- [ ] ¿Mobile glass blur ≤ 16px y touch target ≥ 44px?
- [ ] ¿Sin animaciones en `backdrop-filter`?

**Theme**
- [ ] ¿No agregaste toggle de tema, ni leíste `prefers-color-scheme`?

## AI affordances + motion (componentes shared)

Para reforzar el feel "producto con agentes" sin sobrecargar la UI sobria del sistema, hay 4 componentes en `src/components/ui/` que se usan en cualquier flujo agentic:

### `<AIBadge label="..." />`

Pill compacto mono-font + green tint (antes era indigo). Marca contenido generado por un agente.

- Default label: `"AI"`. Usá labels específicos del rol: `"Asesor"`, `"Analyst"`, `"RAG"`.
- Sobre glass: `bg-glass-strong` + `text-white`. Sobre solid: `bg-info-bg` + `text-info`.

### `<Spinner size={16} />`

Anillo `border-2 border-brand-primary/20 border-t-brand-primary animate-spin`. Reemplaza spinners genéricos.

- Default 16px. Variantes: 14 (image upload), 24 (hero loaders).

### `<PhaseDot active={isActive} />`

Dot que marca un nodo de un grafo de agente. Verde sólido + `animate-ping` cuando activo, verde 40% opaco cuando completo.

- El ping ya comunica "está corriendo" — no agregues cursor parpadeante u otros loaders al lado del label.

### `<AuroraBackground />`

3 radial-gradients borrosos en brand-primary (verde) y brand-accent. Para empty states **sin foto**. Si la pantalla ya tiene foto de fondo, **no** apilar Aurora encima.

```tsx
<div className="relative ...">
  <AuroraBackground />
  ...
</div>
```

## Motion + glow (utilities)

| Utility | Uso |
|---|---|
| `focus:ring-4 focus:ring-brand-primary/15` | Glow verde en focus de inputs solid (ya en `.input`). |
| `.focus-glow` | Helper para chips/botones secondary que quieras "alive on focus". Solo focus-visible (teclado). |
| `animate-fade-in` | Entrada suave para mensajes nuevos, phase log, modales. 200ms ease-out. |
| `animate-blink` | Cursor parpadeante. No usar al lado de `<PhaseDot>`. |
| `animate-ping` (Tailwind) | Dot expandiéndose hacia afuera. Usado en `<PhaseDot active>`. |
| `animate-spin` (Tailwind) | Rotación uniforme. Usado en `<Spinner />`. |
| `.dot-grid` | Background pattern técnico sutil. Solo en pantallas admin (sin foto). |

## Reglas de motion

1. **Toda animación es sutil y funcional**, nunca decorativa.
2. **Duraciones cortas**: 150–250ms para fade/transitions, 1100ms para blink, 1000ms para ping.
3. **Nunca animes `backdrop-filter`** — perf brutal en mobile.
4. **`<PhaseDot>` para flujos agentic**, `<Spinner>` para loading global.
5. **`<AIBadge>` solo donde el contenido es generado por un agente.**
6. **Aurora solo en empty states sin foto.** Foto y Aurora no conviven.
7. **Dot-grid solo en admin** (sin foto, sin glass).

## Cuándo cargar `DESIGN.md`

Cargá la referencia completa cuando necesites:
- Token map exacto (CSS vars → Tailwind classes) para implementar nuevos tokens.
- Specs detallados de drop-shadow, gradient overlay, breakpoints responsive.
- Variantes raras (input solid de búsqueda, code input).
- Toda la lista de do/don'ts con razonamiento.
- Quick reference para pasarle a otro agente.

Para edits puntuales (cambiar un botón, restilear un card), este SKILL.md alcanza.
