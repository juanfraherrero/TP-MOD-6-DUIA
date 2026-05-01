# Cinematic Glass — Full Design System Reference

> Sistema completo. El `SKILL.md` de esta carpeta tiene la versión condensada para uso diario; este documento es para casos donde necesites specs exactos (recetas de glass, drop-shadow del título, breakpoints, todas las variantes de superficie). El sistema anterior (Linear-inspired) se preserva en `DESIGN-OLD.md` para referencia histórica.

## 1. Visual Theme & Atmosphere

El sistema "Cinematic Glass" se construye alrededor de dos ideas:

1. **El paisaje es el héroe.** En las pantallas atmosféricas (landing, hero, empty states), una fotografía full-bleed (paisajes de La Rioja, ej: Talampaya, Cuesta de Miranda) llena el viewport. La UI es atmósfera sobre el paisaje — no compite con él, lo amplifica.
2. **Una sola receta de vidrio.** Cada panel flotante en el mismo contexto usa exactamente la misma combinación de blur, opacity, border y shadow. La consistencia del material es lo que separa "interfaz premium" de "stickers pegados encima de una foto".

Para pantallas densas en contenido (admin, formularios, conversación de chat extendida) el sistema mantiene **superficies sólidas theme-aware** con la misma disciplina de antes — Inter Variable, grid de 4px, escala de radius. La transición entre ambos modos es deliberada: el chat empieza en glass sobre la foto, y al primer mensaje del usuario el viewport se desliza a un layout sólido legible.

**Características clave**

- Una receta única de glass por contexto (no mezclar opacidades/blurs).
- Verde institucional como único acento en CTAs (`#0F7A4A`).
- Texto puro blanco con opacity steps (100 / 70 / 60 / 50) sobre glass.
- Tipografía Inter Variable, idéntica al sistema anterior — la disciplina tipográfica no cambia.
- Drop-shadow obligatorio en títulos sobre foto (no decoración: legibilidad).
- Gradient overlay obligatorio en backgrounds fotográficos.
- **App light-only**: el toggle de tema fue removido. `<ThemeProvider>` y `NO_FLASH_SCRIPT` fuerzan `data-theme="light"` — ignoran el `prefers-color-scheme` del SO. Los tokens dark siguen definidos en `globals.css` por si se reactiva en el futuro, pero hoy no se renderizan. El glass sigue siendo theme-agnostic (white con baja opacidad sobre foto).
- **Familia CTA alineada**: `btn-primary-cta` (verde sólido), `btn-outline-cta` (outline verde) y `btn-secondary` (ghost) comparten `h-10 px-4 rounded-xl text-button` para que alineen en filas (form footers, modals).
- **Branded chip** como pattern recurrente: `bg-brand-primary/10 text-brand-primary border border-brand-primary/20` es la receta canónica para state activo (admin nav, status pills, hovers de chips secundarias). NO es un CTA — es un indicator.
- **Admin shell** = sticky translucent header (`bg-surface-primary/85 backdrop-blur-md`) + brand stripe (gradient verde) abajo. Pattern "subtle glass on solid" que conecta admin con el landing sin romper la legibilidad de pantallas densas.

## 2. Color Palette & Roles

### Brand (constantes — no flipean por tema)

- **Brand Primary** (`#0F7A4A`): Verde institucional. **Solo en el primary CTA visible.** Reemplaza el indigo `#5E6AD2` del sistema anterior.
- **Brand Accent** (`#16A06A`): Hover/focus del CTA primario. También admisible para focus rings.
- **Brand Deep** (`#0A5C38`): Active/pressed state del CTA primario.

### Glass tokens (transparentes — sin modificador `/X`)

- **`glass-bg`** → `rgba(255, 255, 255, 0.06)` — background de panel glass sobre foto luminosa. En contexto sobre foto oscura usar `0.08`.
- **`glass-bg-hover`** → `rgba(255, 255, 255, 0.10)` — hover de chips/botones glass.
- **`glass-border`** → `rgba(255, 255, 255, 0.12)` — border de panel glass.
- **`glass-border-strong`** → `rgba(255, 255, 255, 0.18)` — border de chips (necesitan más definición que paneles grandes).
- **`glass-highlight`** → `rgba(255, 255, 255, 0.15)` — inset top highlight, simula refracción de luz superior.
- **`glass-shadow`** → `0 24px 60px rgba(0, 0, 0, 0.25)` — sombra exterior del panel grande.
- **`glass-shadow-sm`** → `0 8px 24px rgba(0, 0, 0, 0.20)` — sombra del input bar y chips.

> **Por qué white sobre todo**: Glass es ópticamente transparente; tiñe lo que está debajo. Si el bg fuera de marca o gris, distorsionaría los colores de la foto. White con baja opacidad lava la imagen sin mancharla.

### Text-on-glass (white + opacity, no grays)

- `text-glass` → `rgba(255, 255, 255, 1)` — título principal.
- `text-glass-secondary` → `rgba(255, 255, 255, 0.70)` — subtítulo, descripción.
- `text-glass-muted` → `rgba(255, 255, 255, 0.60)` — eyebrow label, links secundarios.
- `text-glass-placeholder` → `rgba(255, 255, 255, 0.50)` — placeholder de input.

### Solid surfaces theme-aware (kept — light → dark)

```
surface-primary     #FAFAF7 → #0F1011   ← background de página solid
surface-secondary   #F2F1EC → #141516   ← cards, paneles elevados
surface-tertiary    #E8E6DD → #1A1B1E   ← hover bg, code blocks claros
surface-overlay     #DEDDD3 → #08090A   ← overlay máximo / code dark
```

> Cambio respecto al sistema anterior: light mode ya no es blanco puro `#FFFFFF`. Es un off-white cálido `#FAFAF7` que armoniza con la paleta ocre de la foto (canyon rojo). Esto evita el "salto a blanco quirúrgico" cuando el usuario pasa del hero glass a una vista de chat.

### Solid text theme-aware (light → dark)

```
text-primary        #08090A → #F7F8F8
text-secondary      #5E5852 → #A8A29A   ← warmer than the old neutral grays
text-tertiary       #8A847C → #8A847C
text-muted          #383530 → #B8B0A4
text-on-cta         #FFFFFF → #FFFFFF   ← always white on green CTA
```

### State colors (theme-aware, light → dark)

```
warning             #B47D1A → #F0C674   ← idéntico al sistema previo
warning-bg          #FAE6B4 → #3A2E1C
warning-border      #E8D199 → #5E4A26
danger              #C92A2A → #E5484D
danger-hover        #B91C1C → #FF6369
danger-bg           rgba(201,42,42,0.08) → rgba(229,72,77,0.10)
info                #0F7A4A → #16A06A   ← ahora green-tinted (alineado con brand)
info-bg             rgba(15,122,74,0.08) → rgba(22,160,106,0.12)
info-border         rgba(15,122,74,0.20) → rgba(22,160,106,0.25)
```

### Borders theme-aware (rgba)

```
border-soft         rgba(0,0,0,0.06) → rgba(255,255,255,0.05)
border-medium       rgba(0,0,0,0.10) → rgba(255,255,255,0.08)
border-strong       rgba(0,0,0,0.14) → rgba(255,255,255,0.14)
```

### Cuándo usar cada estado

- **warning** — banner de error recuperable (validation, fetch retry, SQL preview rechazado).
- **danger** — solo acciones destructivas (DeleteButton, "Quitar imagen", "Borrar conversación").
- **info** — paneles informativos, hints, ragNotes. Ahora es **verde** (alineado con la marca) — no confundir con CTA: panels info nunca tienen el green `bg-brand-primary` puro, solo el `info-bg` muy translúcido.

## 3. Typography Rules

### Font Family

- **Primary**: Inter Variable (400, 510, 590, 600 weights) — fallback `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.
- **Mono**: Berkeley Mono (400 weight) — fallback `"SF Mono", Monaco, "Cascadia Code", monospace`. Solo para código/SQL/identifiers.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|-----------------|-------|
| Hero Title | Inter Variable | 44px | 600 | 52px | -0.02em (`tracking-tight`) | Hero glass card. **Drop-shadow obligatorio sobre foto** (ver §6). |
| Display 1 | Inter Variable | 64px | 600 | 64px | -0.02em | Page hero en superficies sólidas |
| Display 2 | Inter Variable | 48px | 590 | 56px | -0.01em | Section headers |
| Heading 3 | Inter Variable | 20px | 590 | 26.6px | 0 | Card titles |
| Heading 4 | Inter Variable | 16px | 590 | 24px | 0 | Form labels, énfasis |
| Body | Inter Variable | 15px | 400 | 24px | 0 | Copy primario |
| Body Span | Inter Variable | 16px | 400 | 24px | 0 | Subtítulos en hero glass |
| Eyebrow | Inter Variable | 11px | 510 | 14px | 0.12em (uppercase) | Etiqueta sobre el título del hero |
| Link | Inter Variable | 14px | 510 | 21px | 0 | Nav links |
| Button | Inter Variable | 13px | 510 | 19.5px | 0 | Labels de botón (peso 510, no 400 — sobre verde necesita más densidad) |
| Code | Berkeley Mono | 14px | 400 | 24px | 0 | Code blocks |
| Code Small | Berkeley Mono | 12.25px | 400 | 15.925px | 0 | Inline code |

### Principles

- **Hero Title** siempre con `drop-shadow: 0 2px 12px rgba(0, 0, 0, 0.4)` cuando va sobre foto. Sobre superficie sólida no lleva drop-shadow.
- Weight `600` para hero title — sube de 510 (sistema anterior) a 600 porque sobre foto necesita más cuerpo.
- Weight `590` para form labels y headings chicos.
- Weight `510` para nav, buttons, eyebrow.
- Weight `400` para todo body content.
- Eyebrow siempre uppercase + `letter-spacing: 0.12em`. Le da contexto al título sin robarle protagonismo.
- `tracking-tight` (-0.02em) en titulares grandes (40px+). 0em en todo lo demás.

## 4. Component Stylings

### 4.1 Photo Hero Container

Background fotográfico full-bleed con overlay degradado. Es el contexto donde vive el glass.

```tsx
<section className="relative min-h-screen w-full">
  {/* Foto full-bleed */}
  <Image
    src="/canyon-hero.webp"
    alt=""
    fill
    priority
    className="object-cover"
  />
  {/* Overlay de legibilidad — NO NEGOCIABLE */}
  <div
    className="absolute inset-0 pointer-events-none"
    style={{
      background:
        "linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 35%, transparent 60%)",
    }}
  />
  {/* Contenido glass encima */}
  <div className="relative z-10">...</div>
</section>
```

**Specs**

- Imagen: `object-cover`, `priority` (LCP).
- Overlay degradado de abajo hacia arriba: `rgba(0,0,0,0.45)` → transparent al 60% de altura. Garantiza legibilidad del input bar (zona inferior) sin oscurecer el cielo.
- Si el contenido glass está más al centro/superior, agregar también un degradado top: `linear-gradient(to bottom, rgba(0,0,0,0.20), transparent 30%)`.
- Foto debe tener una zona "calma" en el centro (cielo o cliff plano) — NO usar fotos con detalle visual fuerte detrás del título.

### 4.2 Top Nav (transparent over photo)

```tsx
<header className="absolute top-0 inset-x-0 z-20 h-18 flex items-center justify-between px-6">
  <div className="flex items-center gap-3">
    <CoatOfArmsIcon className="size-8 text-white" />
    <span className="text-white text-link leading-tight">
      Gobierno
      <br />
      de La Rioja
    </span>
  </div>
  <nav className="flex items-center gap-8">
    <a className="text-white/80 hover:text-white text-link transition-colors">Servicios</a>
    <a className="text-white/80 hover:text-white text-link transition-colors">Noticias</a>
    <a className="text-white/80 hover:text-white text-link transition-colors">Portal Ciudadano</a>
  </nav>
</header>
```

**Specs**

- Height: `72px` (`h-18`).
- Background: completamente transparente (la foto se ve a través).
- No shadow (a diferencia del nav L1 del sistema anterior).
- Padding horizontal: `24px`.
- Wordmark: lockup de dos líneas, peso 510, 14px.
- Links: 14px, `text-white/80` con hover `text-white`. Gap de 32px entre links.

### 4.3 Hero Glass Card (la receta canónica)

Es el panel central. **Cualquier otro panel glass en la página debe heredar esta receta** — solo varía radius.

```tsx
<div
  className="
    relative max-w-[720px] mx-auto
    rounded-[20px] p-12
    border border-glass-border
    bg-glass
    backdrop-blur-2xl backdrop-saturate-150
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
  <div className="mt-8 flex flex-wrap gap-3 justify-center">
    {/* Suggestion chips */}
  </div>
</div>
```

**Specs**

- `max-width`: 720px.
- `padding`: 48px.
- `border-radius`: **20px** (no 8px — el cinematic look pide más curva).
- `background`: `rgba(255,255,255,0.06)` (6%).
- `backdrop-filter`: `blur(24px) saturate(140%)`. Saturate compensa el lavado del blur.
- `border`: `1px solid rgba(255,255,255,0.12)`.
- `box-shadow`: dos capas — inset top highlight + drop shadow exterior.
- Gap interno entre eyebrow → title → subtitle → chips: 24px / 16px / 32px.
- Centrado en el viewport, eje vertical en `45vh` (no exactamente al medio — el ojo lee mejor un poco arriba del centro).

### 4.4 Suggestion Chips (glass pill)

```tsx
<button
  className="
    inline-flex items-center gap-2
    px-4 py-2.5
    rounded-full
    bg-glass border border-glass-border-strong
    text-white text-link
    backdrop-blur-xl
    hover:bg-glass-hover
    transition-colors
  "
>
  <MapPinIcon className="size-3.5" />
  Talampaya
</button>
```

**Specs**

- `padding`: `10px 16px` (`px-4 py-2.5`).
- `border-radius`: **9999px** (pill).
- `background`: `rgba(255,255,255,0.08)` (un poco más opaco que el panel — chips son interactivos, necesitan estar más definidos).
- `border`: `1px solid rgba(255,255,255,0.18)` (`glass-border-strong`).
- `backdrop-filter`: `blur(20px)`.
- Icono leading: 14px, `MapPin` o equivalente. Refuerza el affordance "destinos sugeridos".
- Gap entre chips: `12px`.
- Hover: bg sube a `rgba(255,255,255,0.16)`. Sin lift, sin shadow extra.
- **NO** drop-shadow en chips (el panel ya las contiene).

### 4.5 Floating Chat Input Bar

Anclada al fondo del hero, ancho idéntico al panel hero (720px) para alineación vertical.

```tsx
<form
  className="
    fixed bottom-8 left-1/2 -translate-x-1/2 z-20
    w-[min(720px,calc(100%-32px))]
    flex items-center gap-2
    rounded-2xl
    bg-glass border border-glass-border
    px-3 py-2
    backdrop-blur-2xl
  "
  style={{
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 24px rgba(0,0,0,0.20)",
  }}
>
  <input
    placeholder="Escribí tu mensaje…"
    className="
      flex-1 bg-transparent border-0 outline-none
      px-3 py-2.5
      text-white placeholder:text-white/50
      text-body
    "
  />
  <button className="btn-primary-cta">
    <SendIcon className="size-4" />
    <span>Enviar</span>
  </button>
</form>
```

**Specs**

- `position: fixed`, anclado a 32px del fondo, centrado.
- `width`: 720px (mismo que el hero card) — clamp a viewport menos 32px en mobile.
- `border-radius`: **16px** (no 20 — el input es más bajo y el radius más cerrado lee mejor a esa altura).
- `background`: `rgba(255,255,255,0.06)` (mismo que el hero card).
- `backdrop-filter`: `blur(24px)`.
- `padding`: `8px 12px` exterior; el input interno tiene `px-3 py-2.5`.
- Placeholder: `text-white/50`.
- **NUNCA** un fondo blanco sólido en el input — debe ser glass como todo lo demás.

### 4.6 Familia CTA — `btn-primary-cta` / `btn-outline-cta` / `btn-secondary`

Las tres clases comparten la misma línea base — `h-10 px-4 rounded-xl text-button` — para que aliñen visualmente en filas (form footer, modal footer, chat input bar). **Solo cambian bg/border/text.** Lección del activity edit: cuando dos botones en la misma fila tienen alturas o radios distintos, se rompe la grilla y el ojo lo nota inmediatamente.

```css
/* En globals.css */
.btn-primary-cta {
  @apply inline-flex items-center gap-2 h-10 px-4 rounded-xl
         bg-brand-primary text-white text-button
         hover:bg-brand-accent active:bg-brand-deep transition-colors
         disabled:opacity-50 disabled:cursor-not-allowed;
}

.btn-outline-cta {
  @apply inline-flex items-center gap-2 h-10 px-4 rounded-xl
         bg-transparent border border-brand-primary/40
         text-brand-primary text-button
         hover:bg-brand-primary/[0.06] hover:border-brand-primary/60 transition-colors
         disabled:opacity-50 disabled:cursor-not-allowed;
}

.btn-secondary {
  @apply inline-flex items-center gap-2 h-10 px-4 rounded-xl
         bg-transparent text-text-secondary text-button
         hover:bg-surface-soft hover:text-text-primary transition-colors
         disabled:opacity-40;
}
```

**Cuándo usar cada una**

| Botón | Uso | Ejemplos en el repo |
|---|---|---|
| `.btn-primary-cta` | El **único** primary action visible. Verde sólido. | "Enviar" (chat input), "Actualizar / Crear" (activity form), "Usar propuesta" (augment modal), "Consultar" (admin dashboard), "Nueva actividad" (activities list). |
| `.btn-outline-cta` | Acción secundaria con afinidad de marca — el usuario puede invocarla pero no es el camino principal. | "Aumentar con IA" en activity form (al lado de "Actualizar"). |
| `.btn-secondary` | Acción terciaria — escape/cancel/back. Sin compromiso visual. | "Cancelar" en activity form y modals. |

**Specs comunes**

- Height: `40px` (`h-10`).
- `border-radius`: **12px** (`rounded-xl`). **Nunca pill** (`rounded-full`) — choca con inputs rectangulares y desalinea filas.
- Padding horizontal: `16px` (`px-4`).
- Texto: `text-button` (13px / 510).
- Icono leading: 16px (`size-4`), `gap-2`.
- **No shadow** sobre glass — el contraste de color ya separa.

### 4.6.bis `.btn-primary` (legacy) — cuándo todavía sirve

Es la clase del sistema anterior: `h-8 px-3 rounded-full bg-cta-bg shadow-l2` (dark, neutral, pill, multi-layer shadow). **Solo usarla** en controles funcionales no-marca que conviven con un CTA verde en pantalla y no deben competir visualmente con él.

Ejemplo concreto en el repo: el trigger del file upload en `ImageUploadBlock` — si fuera verde, robaría protagonismo al "Actualizar / Crear" del form. Si fuera ghost, no tendría suficiente affordance.

**No usar para acciones primarias nuevas.** Si dudás, usá `.btn-primary-cta`.

### 4.6.ter Branded chip — pattern canónico para state/status

No es un botón ni un CTA. Es un indicator visual con afinidad de marca, usado para active nav state, status pills, y hovers de chips secundarias en superficies sólidas. La receta es **una sola** para que el ojo aprenda a identificarla:

```tsx
{/* Status pill (lista de actividades) */}
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

{/* Active nav link (admin) */}
<Link className="
  h-9 px-3 inline-flex items-center rounded-md
  bg-brand-primary/10 text-brand-primary
  border border-brand-primary/20
  text-link transition-colors
">
  Actividades
</Link>
```

**Specs**

- Background: `bg-brand-primary/10` (verde a 10% opacidad).
- Text: `text-brand-primary` (verde sólido).
- Border: `border-brand-primary/20` (verde a 20% opacidad — define el chip sin gritar).
- Radius: depende del rol — `rounded-full` para status, `rounded-md` para nav active.
- Tamaño: `h-6` para status compactos, `h-9` para nav.
- **No usar `text-brand-accent`** (verde más claro) — perdés contraste. Siempre `text-brand-primary`.
- **No mezclar** con dot mono-font de `<AIBadge>` — esa receta es exclusiva de "esto lo escribió un agente".

### 4.7 Solid Card (post-hero, contextos densos)

Para vistas donde el contenido es protagonista (admin, formularios, conversación de chat extensa). Mantiene la disciplina del sistema anterior.

```tsx
<div className="rounded-lg bg-surface-secondary border border-soft p-6">
  ...
</div>
```

**Specs**

- `border-radius`: 8px (`rounded-lg`).
- `background`: `surface-secondary` (theme-aware).
- `border`: `1px solid border-soft`.
- `padding`: 24px (default), 32px (grandes).
- No shadow (L0).

### 4.8 Solid Text Input (en superficies sólidas, post-hero)

```tsx
<input className="
  w-full h-10 px-3.5
  rounded-md
  bg-input border border-medium
  text-text-primary placeholder:text-text-tertiary
  focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/15
  transition-all
" />
```

**Specs**

- Height: 40px (subido de 32px del sistema anterior — mejor en mobile).
- `border-radius`: 6px.
- `background`: `bg-input` (rgba muy translúcido, theme-aware).
- Focus ring: green tint (`brand-primary/15`).

### 4.9 Admin Shell — sticky translucent header + brand stripe

El admin layout (`src/app/admin/layout.tsx`) usa un patrón **"subtle glass on solid"**: sticky header con `backdrop-blur-md` leve sobre superficie sólida (no es el glass full-blast del landing). Es el toque atmosférico que tira el admin hacia el lenguaje del landing sin sacrificar legibilidad de pantallas densas.

```tsx
<header className="sticky top-0 z-30 bg-surface-primary/85 backdrop-blur-md border-b border-soft">
  <div className="w-full max-w-container mx-auto h-18 px-4 sm:px-6 flex items-center gap-6 sm:gap-10">
    <Link href="/admin/activities" className="flex items-center gap-3 shrink-0">
      <Image
        src="/images/icon-2.png"
        alt="La Rioja"
        width={120}
        height={32}
        className="h-7 w-auto"
        priority
      />
      <span className="hidden sm:inline-block h-5 w-px bg-border-medium" />
      <span className="hidden sm:inline text-link text-text-secondary">Admin</span>
    </Link>
    <AdminNav />
  </div>
  {/* Brand stripe: gradient verde transparente — más elegante que un border sólido */}
  <div className="h-[2px] bg-gradient-to-r from-transparent via-brand-primary/40 to-transparent" />
</header>
```

**Specs**

- `position: sticky`, `top-0`, `z-30`.
- Background: `bg-surface-primary/85` (warm off-white a 85% opacidad). **No `bg-surface-primary`** sólido — perderías el efecto translúcido al hacer scroll.
- Blur: `backdrop-blur-md` (12px). **NO `backdrop-blur-2xl`** (24px) — eso es solo para glass-over-photo. En admin, el blur fuerte se ve forzado.
- Height: `h-18` (72px) — heredado del sistema anterior.
- Border bottom: `border-b border-soft` (hairline) + brand stripe abajo (`h-[2px]` con gradient verde transparente).
- Wordmark: `icon-2.png` (verde "LA RIOJA - Argentina") en `h-7` (28px). Si no tenés el wordmark, usá lockup textual.
- Hairline divider (`h-5 w-px bg-border-medium`) entre wordmark y "Admin" — se oculta en mobile.

#### Admin Nav (active state)

`AdminNav` es un client component (`src/components/ui/AdminNav.tsx`) que usa `usePathname()` para resaltar la ruta activa con la receta de **branded chip** (ver §4.6.ter):

```tsx
<Link
  className={
    active
      ? "h-9 px-3 inline-flex items-center rounded-md bg-brand-primary/10 text-brand-primary border border-brand-primary/20 text-link transition-colors"
      : "h-9 px-3 inline-flex items-center rounded-md text-link text-text-secondary hover:bg-surface-soft hover:text-text-primary border border-transparent transition-colors"
  }
>
  Actividades
</Link>
```

Inactive lleva `border border-transparent` para que el size no flippee al activarse.

### 4.10 Page Header — eyebrow + display title + subtitle

Al tope de cada página densa (admin), después del shell. Patrón de jerarquía que ancla contexto antes del contenido:

```tsx
<header className="space-y-2">
  {/* opcional: back-link breadcrumb */}
  <Link
    href="/admin/activities"
    className="inline-flex items-center gap-1.5 text-link text-text-secondary hover:text-brand-primary transition-colors"
  >
    <span aria-hidden="true">←</span> Actividades
  </Link>
  <span className="block text-eyebrow uppercase text-text-tertiary mt-4">
    Catálogo · La Rioja
  </span>
  <h1 className="text-display-2 text-text-primary">Actividades</h1>
  <p className="text-body-span text-text-secondary max-w-xl">
    Gestioná las experiencias turísticas que el Agente recomienda a los visitantes.
  </p>
</header>
```

**Specs**

- Eyebrow: `text-eyebrow uppercase text-text-tertiary` (11px, tracked-wide). Va antes del title como contexto.
- Title: `text-display-2` (48px / 590 / -0.01em). **No `text-h3`** — los headers de página merecen presencia.
- Subtitle: `text-body-span text-text-secondary max-w-xl`. Limitar el ancho para legibilidad.
- Back-link: arrow + label, `text-text-secondary hover:text-brand-primary`. Sin background, sin pill, minimal.
- Si la página tiene CTA primary (ej: "Nueva actividad"), va alineado a la derecha del header con `flex items-end justify-between`.

### 4.11 Empty State con aurora glow sobre solid

Empty states dentro de cards en admin (sin foto). Aurora suave verde + CTA verde. **No** usar `<AuroraBackground />` acá — esa es para empty states full-page; este patrón vive dentro de un container.

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

## 5. Layout Principles

### 5.1 Spacing System

**Base**: `4px`. Toda dimensión es múltiplo.

`4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 36 · 40 · 48 · 56 · 64 · 80` (px).

**Cambio respecto al sistema anterior**: agregamos `56`, `64`, `80` al spectrum permitido — son los tamaños que aparecen en hero glass (padding 48, gap entre title y subtitle 16, gap a chips 32, padding bottom del hero 80).

**Usage**

- Hero card padding: `48px`.
- Botón padding horizontal: `16px` (subió de 12 — la palabra "Enviar" + icono lo pide).
- Input padding: `12–14px`.
- Solid card padding: `24px` (default), `32px` (grandes).
- Gap entre chips: `12px`.
- Gap entre title y subtitle: `16px`.
- Gap entre subtitle y chips row: `32px`.
- Gap entre eyebrow y title: `24px`.
- Bottom-anchor del input bar: `32px`.

### 5.2 Grid & Container

- `max-width` global: `1440px`.
- Hero glass card: `max-width: 720px`, centrado.
- Chat input bar: `max-width: 720px` (igual que hero — alineación vertical).
- En mobile: ambos colapsan a `100% - 32px` (16px margin a cada lado).

### 5.3 Whitespace Philosophy

El glass usa whitespace para **dejar respirar la foto**. Padding generoso dentro del panel (48px) y márgenes amplios entre eyebrow / title / subtitle / chips. La foto debe ser visible alrededor del panel (al menos 15% de viewport de "aire" arriba y abajo del card).

En contextos sólidos, padding 24–32px y gap 24–40px (idéntico al sistema anterior).

### 5.4 Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `rounded-sm` | 4px | Controles densos |
| `rounded-md` | 6px | Inputs, form controls |
| `rounded-lg` | 8px | Cards sólidas, containers |
| `rounded-xl` | 12px | **Primary CTA sobre glass** |
| `rounded-2xl` | 16px | **Glass input bar** |
| `rounded-[20px]` | 20px | **Hero glass card** |
| `rounded-full` | 9999px | Pills, chips, avatares |

> Cambio respecto al sistema anterior: agregamos `12`, `16`, `20` a la escala. **Solo válidos para los componentes glass listados arriba** — no usar para cards sólidas (esas siguen en 8).

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| **L0** | sin shadow, surface plana | UI default, cards sólidas |
| **L1** | `0 1px 0 0 rgba(0,0,0,0.4)` (bottom border-shadow) | Nav header en superficies sólidas |
| **L2** | multi-layer (ver detalle abajo) | Modales sólidos, primary buttons en superficies sólidas |
| **L-glass** | `inset 0 1px 0 rgba(255,255,255,0.15), 0 24px 60px rgba(0,0,0,0.25)` | Hero card glass |
| **L-glass-sm** | `inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 24px rgba(0,0,0,0.20)` | Glass input bar, modales glass |

**L2 multi-layer (sistema anterior, kept para superficies sólidas)**:

```
rgba(0,0,0,0)    0 8px 2px 0,
rgba(0,0,0,0.01) 0 5px 2px 0,
rgba(0,0,0,0.04) 0 3px 2px 0,
rgba(0,0,0,0.07) 0 1px 1px 0,
rgba(0,0,0,0.08) 0 0 1px 0
```

**Title drop-shadow (text shadow, no box shadow)**:

```css
text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
```

Aplicado al hero title cuando va sobre foto. Es legibilidad, no decoración.

**Filosofía**

- Glass usa **dos capas obligatorias**: inset top highlight (simula refracción de luz superior) + drop shadow exterior (separa del background fotográfico). Sin las dos, el panel se ve plano y "pegado".
- L2 multi-layer queda reservado para superficies sólidas. **Nunca** mezclar L2 con L-glass — son lenguajes distintos.
- Chips no llevan elevación propia — la heredan del panel padre.

## 7. Do's and Don'ts

### Do

- Usá **una sola receta de glass por pantalla** — bg, blur, border, shadow lockeados; solo varía radius.
- Aplicá **drop-shadow al título** cuando va sobre foto.
- Aplicá **gradient overlay al fondo fotográfico** — no negociable.
- Verde de marca **solo en el primary CTA visible**.
- Texto sobre glass: **white + opacity** (100/70/60/50). Cero grays.
- Eyebrow uppercase + tracking 0.12em sobre títulos importantes.
- Chips: pill (9999px) con leading icon de 14px.
- Send button: radius 12px (no pill) sobre input glass.
- Backdrop-blur: 24px en panel hero, 20px en chips, 24px en input bar.
- Surface sólida = warmer off-white `#FAFAF7` (no white quirúrgico).
- En mobile bajar `backdrop-blur` a `16px` (perf en iOS Safari).

### Don't

- **No mezcles dos opacidades de glass** en la misma pantalla. Si el card es 6%, los chips tampoco pueden ser 12% — todos derivan de la misma base.
- **No uses `bg-white` sobre foto.** Nunca. Ni en input, ni en botones, ni en panels.
- **No uses pill (9999px) para el send button.** Choca con el input rectangular. 12px.
- **No drop-shadow en chips ni inputs glass.** El panel padre ya los contiene.
- **No olvides el gradient overlay** — sin él el input es ilegible cuando la foto tiene zonas claras al fondo.
- **No uses hex literales** en JSX. Si falta un token, agregalo al CSS + Tailwind.
- **No uses indigo `#5E6AD2`** — fue reemplazado por verde. Auditar todas las referencias.
- **No mezcles glass con L2 multi-layer** — un panel es glass o es sólido, no ambos.
- **No backgrounds fotográficos saturados detrás del título** — usá fotos con zona "calma" en el centro.
- **No animaciones en backdrop-filter** — son brutales en perf (especialmente en mobile).
- **No `text-text-secondary` sobre glass** — esos tokens son para superficies sólidas.
- **No mezcles `btn-primary` (h-8 pill) con `btn-primary-cta` (h-10 rounded-xl) en la misma fila.** Lección del activity edit: si una fila tiene tres botones, los tres deben compartir altura y radio. Migrar todos a la familia CTA (`btn-primary-cta` / `btn-outline-cta` / `btn-secondary`).
- **No agregues toggle de tema** ni leas `prefers-color-scheme`. La app es light-only — `<ThemeProvider>` y `NO_FLASH_SCRIPT` fuerzan `light`. Si necesitás dark mode, pedí discusión antes.
- **No uses `backdrop-blur-2xl` (24px) en sticky headers de admin.** Eso es solo para glass-over-photo. En admin, `backdrop-blur-md` (12px) es lo correcto sobre `bg-surface-primary/85`.
- **No uses `text-h3` para títulos de página.** Headers de página merecen `text-display-2` con eyebrow + subtitle. `text-h3` es para cards/secciones.
- **No mezcles `text-brand-accent` (verde claro) con bg `brand-primary/10`** — el contraste no es suficiente. Siempre `text-brand-primary` sobre el branded chip.
- **No uses `dot-grid` en pantallas con foto.** Tampoco en admin con warm off-white — mete ruido visual. Reservalo para pantallas técnicas que necesiten textura, sin foto y sin warm bg.
- **No "outline rojo random"** ni botones con bg/border arbitrario. Usá una de las clases canónicas (`btn-primary-cta` / `btn-outline-cta` / `btn-secondary`) o el branded chip recipe.

## 8. Responsive Behavior

### Breakpoints

| Breakpoint | Width | Glass behavior |
|---|---|---|
| Mobile | `< 640px` | Hero card width = `100% - 32px`. `backdrop-blur: 16px` (no 24 — perf). Padding interno baja a `24px`. Hero title baja a `32px`. Eyebrow baja a `10px`. |
| Tablet | `640–1024px` | Hero card width = `min(640px, 100% - 48px)`. Blur 20px. Padding 32px. Title 40px. |
| Desktop | `1024–1440px` | Spec full. Hero card 720px, padding 48px, title 44px, blur 24px. |
| Large | `> 1440px` | Container max 1440px. Hero card sigue en 720px (no escala). |

### Touch Targets

- Mínimo `44 × 44px`.
- Chips en mobile: bump a `h-12` (48px).
- Send button mobile: `h-12` y radius 14px.
- Nav links mobile: colapsar a hamburger drawer.

### Iconografía sobre glass

- Stroke width `1.5` en mobile, `1.75` en desktop. Líneas más gruesas se notan más sobre glass translúcido.
- Color: `currentColor` siempre (hereda del texto).

## 9. Quick Reference — Iteration Guide

1. **¿Va sobre foto?** → Receta glass: bg `rgba(255,255,255,0.06)`, blur 24px, border `rgba(255,255,255,0.12)`, inset highlight + drop shadow.
2. **¿No va sobre foto?** → Receta solid: bg `surface-secondary`, border `border-soft`, radius 8px (o `rounded-2xl` para más presencia visual).
3. **Texto principal sobre glass**: `text-white` + `drop-shadow` si es título.
4. **Texto secundario sobre glass**: `text-white/70`.
5. **Texto principal solid**: `text-text-primary` (semántico, no `text-white`).
6. **CTA primary**: `.btn-primary-cta` (verde sólido, h-10 rounded-xl). **Solo uno por pantalla.**
7. **CTA secondary con afinidad de marca**: `.btn-outline-cta` (verde outline, mismo height/radio).
8. **CTA terciaria (cancel/escape)**: `.btn-secondary` (ghost, mismo height/radio).
9. **Chips glass**: pill, bg `rgba(255,255,255,0.08)`, border `rgba(255,255,255,0.18)`, hover bg sube a `0.16`.
10. **Branded chip (state/status sobre solid)**: `bg-brand-primary/10 text-brand-primary border border-brand-primary/20`. Receta canónica para active nav, status pills, hovers de chips secundarias.
11. **Input glass**: radius 16px, bg `rgba(255,255,255,0.06)`, blur 24px. Send button radius 12px.
12. **Input solid**: `.input` class (h-10 rounded-md, focus ring verde).
13. **Foto bg**: full-bleed `object-cover` + gradient overlay obligatorio (negro 45% bottom → transparent 60%).
14. **Admin shell**: sticky header con `bg-surface-primary/85 backdrop-blur-md` + brand stripe gradient verde abajo. Wordmark `icon-2.png` (h-7) a la izquierda + AdminNav a la derecha.
15. **Page header (admin)**: eyebrow uppercase + `text-display-2` + `text-body-span` subtitle. Opcional: back-link breadcrumb arriba.
16. **Empty state sobre solid**: card `rounded-2xl border-soft bg-surface-secondary` con radial blur verde sutil (`bg-brand-primary/[0.10] blur-[120px]`) absoluto detrás.
17. **Spacing en múltiplos de 4** — `4·8·12·16·20·24·28·32·36·40·48·56·64·80`.
18. **Radius scale**: `4·6·8·12·16·20·9999`. 12/16/20 reservados para glass + CTA buttons.
19. **Solid surface light** = `#FAFAF7` (warm off-white), **no** `#FFFFFF`.
20. **Eyebrow** uppercase + `tracking-[0.12em]` + 11px. Sobre glass: `text-white/60`. Sobre solid: `text-text-tertiary`.
21. **Hero title** weight 600, `tracking-tight`, drop-shadow sobre foto.
22. **App es light-only.** No tocar ThemeProvider ni leer `prefers-color-scheme`.
23. **Mobile glass blur** = 16px (no 24 — perf iOS Safari).

## Apéndice — Token map (CSS vars → Tailwind classes)

Para que el follow-up de implementación no tenga ambigüedad, así se mapean los tokens nuevos a CSS y Tailwind:

```css
/* globals.css */
:root {
  /* Brand */
  --brand-primary: 15 122 74;        /* #0F7A4A */
  --brand-accent: 22 160 106;        /* #16A06A */
  --brand-deep: 10 92 56;            /* #0A5C38 */

  /* Glass (transparentes) */
  --glass-bg: rgba(255, 255, 255, 0.06);
  --glass-bg-hover: rgba(255, 255, 255, 0.10);
  --glass-bg-strong: rgba(255, 255, 255, 0.08);
  --glass-border: rgba(255, 255, 255, 0.12);
  --glass-border-strong: rgba(255, 255, 255, 0.18);
  --glass-highlight: rgba(255, 255, 255, 0.15);

  /* Text on glass */
  --text-glass: rgba(255, 255, 255, 1);
  --text-glass-secondary: rgba(255, 255, 255, 0.70);
  --text-glass-muted: rgba(255, 255, 255, 0.60);
  --text-glass-placeholder: rgba(255, 255, 255, 0.50);

  /* Solid surfaces light */
  --surface-primary: 250 250 247;    /* #FAFAF7 */
  --surface-secondary: 242 241 236;  /* #F2F1EC */
  /* ... */
}
```

```ts
// tailwind.config.ts (extend.colors)
brand: {
  primary: 'rgb(var(--brand-primary) / <alpha-value>)',
  accent: 'rgb(var(--brand-accent) / <alpha-value>)',
  deep: 'rgb(var(--brand-deep) / <alpha-value>)',
},
glass: {
  DEFAULT: 'var(--glass-bg)',
  hover: 'var(--glass-bg-hover)',
  strong: 'var(--glass-bg-strong)',
},
// ... + boxShadow.l-glass / l-glass-sm como utilities
```

Las clases utilitarias `.glass-panel`, `.glass-chip`, `.glass-input` definidas en `globals.css` encapsulan la receta completa (bg + blur + border + shadow + radius) para que ningún componente pueda romperla por error.

### Apéndice — Clases utilitarias canónicas (status real en `globals.css`)

Esto es lo que **ya está implementado** y sirve como referencia de lo que existe vs. lo que tendrías que escribir manualmente:

```css
/* Glass family — receta única, solo varía radius */
.glass-panel  { /* radius 20, blur 24, shadow grande */ }
.glass-input  { /* radius 16, blur 24, shadow chica */ }
.glass-chip   { /* radius 9999, blur 20, hover bg-hover */ }

/* Text shadow para títulos sobre foto */
.text-shadow-hero { text-shadow: 0 2px 12px rgba(0,0,0,0.4); }

/* Mobile auto-drop a 16px de blur (perf iOS) */
@media (max-width: 640px) {
  .glass-panel, .glass-input, .glass-chip {
    backdrop-filter: blur(16px) saturate(140%);
  }
}

/* Familia CTA — todas h-10 px-4 rounded-xl para alinear en filas */
.btn-primary-cta  { /* verde sólido + hover accent + active deep */ }
.btn-outline-cta  { /* outline verde + hover bg verde 6% */ }
.btn-secondary    { /* ghost + hover bg-surface-soft */ }

/* Legacy — solo para controles no-marca (file upload trigger) */
.btn-primary      { /* h-8 px-3 rounded-full bg-cta-bg dark + L2 shadow */ }

/* Form input solid */
.input            { /* h-10 rounded-md bg-input + focus ring verde */ }

/* Card solid */
.card-solid       { /* bg-surface-secondary border-soft rounded-lg */ }
.card-dark        { /* alias legacy de .card-solid */ }

/* Focus glow para chips/secondary */
.focus-glow       { /* focus-visible:ring-4 ring-brand-primary/15 */ }

/* Background pattern técnico — solo admin sin foto, sin warm bg */
.dot-grid         { /* radial gradient pattern */ }
```

### Apéndice — Componentes shared en `src/components/ui/`

| Componente | Función | Notas |
|---|---|---|
| `<ThemeProvider>` | Context + sync `data-theme` al DOM. **Forzado a "light".** | No tocar a menos que reactives dark mode. |
| `NO_FLASH_SCRIPT` | Script inline en `<head>` que setea `data-theme="light"` antes del paint. | Inyectado en `layout.tsx`. |
| `<AdminNav>` | Nav del admin shell con active state via `usePathname`. | Client component. |
| `<AIBadge label="…">` | Pill mono-font + green tint para "esto lo escribió un agente". | NO confundir con branded chip. |
| `<Spinner size={16}>` | Anillo verde animado. | Default 16, variantes 14 / 24. |
| `<PhaseDot active>` | Dot verde para grafos de agente. Active → ping animation. | El ping ya comunica "running" — no apilar otros loaders. |
| `<AuroraBackground>` | 3 radial gradients verdes borrosos. Empty states **sin foto, full-page**. | Para empty states dentro de cards usar el patrón inline §4.11. |
| `<ChatErrorBanner>` | Error genérico con retry. Usa warning tokens. | El error técnico se loguea, nunca se muestra al usuario. |
| `<DeleteButton>` | Acción destructiva ghost. | Ya usa danger tokens correctamente. |
