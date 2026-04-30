---
name: design-system
description: Use when adding or modifying any UI in this TP DUIA project — pages under src/app/, components under src/components/, layouts, forms, chat bubbles, modals, buttons, inputs, navigation, or anything visual. Enforces the Linear-inspired theme-aware design system (light + dark via `data-theme` on `<html>`, controlled by ThemeProvider in src/components/ui/): semantic color tokens (`brand-primary` constant, `surface-{primary,secondary,tertiary,overlay}`, `text-{primary,secondary,tertiary,muted,on-cta}`, state colors `warning/danger/info` that flip per theme), typography (Inter Variable 400/510/590 + Berkeley Mono for code), 4px spacing grid, border-radius scale (4/6/8/9999px), shadow elevation levels (L0/L1/L2). Apply whenever editing JSX/TSX with className or style props, or when restyling existing UI. The full reference is in DESIGN.md (same folder) — load it when you need exact specs beyond what's in this card.
---

# Design system — TP DUIA

UI inspirada en Linear: minimalista, sin ruido visual. Whitespace generoso, paleta restringida, tipografía precisa. **Soporta light y dark mode** via `data-theme` en `<html>` (toggle global en `<ThemeToggle>`, persistencia en localStorage, default según `prefers-color-scheme`).

> **Referencia completa**: `DESIGN.md` en esta misma carpeta. Cargala cuando necesites specs exactos de un componente que no esté en este card (ej: shadows multi-layer, breakpoints, todas las variantes de typography).

## Theming — cómo funciona

Los tokens son **semánticos**, no literales: en vez de `surface-dark` (que en light mode mentiría), tenemos `surface-primary` que vale `#FFFFFF` en light y `#0F1011` en dark.

- Definidos como CSS vars en `src/app/globals.css` bajo `:root` (light, default) y `[data-theme="dark"]`.
- Tailwind los expone como clases normales (`bg-surface-primary`, `text-text-primary`, etc.) usando `rgb(var(--xxx) / <alpha-value>)` — soporta modificador `/X`.
- Tokens transparentes (rgba: `border-soft`, `bg-input`, `bg-modal-backdrop`, `info-bg`, `danger-bg`) usan `var(--xxx)` directo y **no aceptan** modificador `/X` — son full-opacity por diseño.
- `<ThemeProvider>` (en `src/components/ui/ThemeProvider.tsx`) maneja state + persistencia. `<ThemeToggle>` es un botón fixed bottom-right global.
- Anti-flash: hay un script inline en `<head>` (`NO_FLASH_SCRIPT`) que setea `data-theme` antes del paint.

**No hardcodees colores hex en JSX.** Usá siempre tokens. Si necesitás un color que el sistema no cubre, agregalo como CSS var en globals.css y exponelo en tailwind.config.ts — no inventes hex literals.

## Tokens canónicos

### Colores (no inventes, usá estos)

Constantes (no flipean):

```
brand-primary       #5E6AD2   ← CTA primario, links, focus rings, accent del user bubble
brand-accent        #828FFF   ← hover/accent secundario
```

Theme-aware (cambian según light/dark — listados como `light → dark`):

```
Surfaces
  surface-primary     #FFFFFF → #0F1011   ← background de página
  surface-secondary   #F7F8F8 → #141516   ← panels, bubbles, cards elevados, modal container
  surface-tertiary    #EFEFF1 → #1A1B1E   ← hover bg más visible, fondos de code blocks claros
  surface-overlay     #F0F1F4 → #08090A   ← code block dark / superficie de máximo contraste

Text
  text-primary        #08090A → #F7F8F8   ← texto principal
  text-secondary      #62666D → #62666D   ← copy de soporte (igual en ambos)
  text-tertiary       #8A8F98 → #8A8F98   ← disabled, muted, ghost button text (igual en ambos)
  text-muted          #383B3F → #B4BCD0   ← hover state de text-tertiary
  text-on-cta         #FFFFFF → #08090A   ← texto sobre el CTA

CTA
  cta-bg              #08090A → #E5E5E6   ← background del primary button (alto contraste)
  cta-bg-hover        #23252A → #DADADB   ← hover del primary button

State colors (semánticos)
  warning             #B47D1A → #F0C674   ← texto warning sobre warning-bg
  warning-bg          #FAE6B4 → #3A2E1C   ← background del banner warning
  warning-border      #E8D199 → #5E4A26   ← border del banner warning
  danger              #C92A2A → #E5484D   ← texto/icon destructivo
  danger-hover        #B91C1C → #FF6369   ← hover del danger
```

Transparentes (rgba — sin modificador /X):

```
border-soft         rgba(0,0,0,0.06)  / rgba(255,255,255,0.05)   ← divisores sutiles, borders de cards
border-medium       rgba(0,0,0,0.10)  / rgba(255,255,255,0.08)   ← borders de inputs, chips
border-strong       rgba(0,0,0,0.14)  / rgba(255,255,255,0.14)   ← hover de border-medium, spinner ring
bg-input            rgba(0,0,0,0.02)  / rgba(255,255,255,0.02)   ← background de input dark
bg-surface-soft     rgba(0,0,0,0.03)  / rgba(255,255,255,0.03)   ← hover sutil de filas y chips
bg-modal-backdrop   rgba(8,9,10,0.40) / rgba(8,9,10,0.80)        ← backdrop de modal
danger-bg           rgba(201,42,42,0.08) / rgba(229,72,77,0.10)  ← hover ghost danger
info-bg             rgba(94,106,210,0.08)                         ← panel info (igual en ambos)
info-border         rgba(94,106,210,0.20)                         ← border del panel info
```

**Cuándo usar cada estado**:

- **warning** — banner de error recuperable (validation falla, fetch falla con retry, validation error del SQL). Receta: `bg-warning-bg text-warning border border-warning-border rounded-md p-3` (sin `/40`, los colores ya son adecuados por tema).
- **danger** — solo acciones destructivas (DeleteButton, "Quitar imagen"). Receta ghost: `text-danger hover:text-danger-hover hover:bg-danger-bg`. NO uses danger para errores no-destructivos — eso es warning.
- **info** — paneles informativos / hints / notas (ragNotes en AugmentModal). Receta: `bg-info-bg border border-info-border text-text-primary rounded-lg p-4`.

### Typography

- **Font UI**: Inter Variable, weights 400 / 510 / 590. Fallback `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.
- **Font code**: Berkeley Mono (fallback `"SF Mono", Monaco, "Cascadia Code", monospace`). Solo para SQL, identificadores, code blocks.
- **Nunca** mezclar serif con esto.

| Rol | Size | Weight | Line-height | Uso |
|---|---|---|---|---|
| Display 1 | 64px | 510 | 64px | Hero, titulares de página |
| Display 2 | 48px | 510 | 48px | Section headers |
| Heading 3 | 20px | 590 | 26.6px | Títulos de card |
| Heading 4 | 16px | 590 | 24px | Form labels, énfasis |
| Body | 15px | 400 | 24px | Copy primario |
| Body span | 16px | 400 | 24px | Copy secundario, content blocks |
| Link | 14px | 510 | 21px | Nav links, inline links |
| Button | 13px | 400 | 19.5px | Labels de botón |
| Code | 14px | 400 | 24px | Bloques de código |
| Code small | 12.25px | 400 | 15.925px | Inline code |

Letter-spacing siempre `0px`. Weight `510` = "semi-bold" para nav y subheadings; `590` para form labels y títulos chicos.

### Spacing — grid de 4px (no rompas la grilla)

`4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 36 · 40 · 48 · 52` (px). **Cualquier padding/margin debe ser un múltiplo de 4.**

Convenciones:
- Padding de botón: `12px` horizontal.
- Padding de input: `12–14px`.
- Padding de card: `24px` (estándar) hasta `32px` (grandes).
- Gap entre cards: `24–40px`.
- Margin entre sections: `20–52px`.

### Border radius

Solo estos valores. Nada de `5px`, `10px`, etc.

- `4px` — controles densos.
- `6px` — inputs, form controls. **Default para inputs.**
- `8px` — cards, containers, bloques principales. **Default para cards.**
- `9999px` — pill-shaped (botones primary/secondary, tags).
- `50%` — avatares, circle icons.

### Elevación — solo 3 niveles

| Nivel | Treatment | Cuándo |
|---|---|---|
| **L0** | sin shadow | default — UI plana, cards |
| **L1** | `0px 1px 0px 0px rgba(0,0,0,0.4)` | nav header, separación sutil |
| **L2** | multi-layer (ver DESIGN.md §6) | primary buttons + modales únicamente |

**Nunca** apliques shadow a cualquier elemento interactivo "porque sí". L2 está reservado.

## Recetas de componentes (las que más vas a usar)

> **Helpers ya disponibles en `globals.css`**: `.input`, `.btn-primary`, `.btn-secondary`, `.card-dark`. Usalos por default; solo escribí las clases manualmente si necesitás una variante.

### Primary button

```tsx
<button className="btn-primary">Acción principal</button>
```

Equivalente expandido:
```tsx
<button className="
  h-8 px-3 rounded-full
  bg-cta-bg text-text-on-cta
  text-btn font-medium
  shadow-l2
  hover:bg-cta-bg-hover transition-colors
  disabled:opacity-50 disabled:cursor-not-allowed
">
  Acción principal
</button>
```

### Secondary / ghost button

```tsx
<button className="btn-secondary">Acción secundaria</button>
```

Equivalente expandido:
```tsx
<button className="
  h-8 px-3 rounded-full
  bg-transparent text-text-tertiary
  text-btn font-normal
  hover:text-text-muted transition-colors
">
  Acción secundaria
</button>
```

### Card (theme-aware)

```tsx
<div className="card-dark px-6 pt-6 pb-7">...</div>
```

(El nombre `.card-dark` es histórico; en realidad es theme-aware: bg `surface-primary`, border `border-soft`.)

Para un card "elevated" (modal, sidebar, panel destacado): usá `bg-surface-secondary` directamente.

### Text input (theme-aware)

```tsx
<input className="input" />
```

### Navigation header

```tsx
<header className="
  h-18 px-6
  flex items-center
  bg-transparent
  text-text-primary text-body-span
  shadow-l1
">
  ...
</header>
```

## Reglas no-negociables

1. **Tokens semánticos sí, hex literales no.** Toda referencia a color va por token (`bg-surface-primary`, `text-warning`). Nunca `bg-[#hex]` ni `text-[#hex]` en JSX. Si falta un token, agregalo en `globals.css` + `tailwind.config.ts`.
2. **Página = `bg-surface-primary`**. Cards/panels elevados = `bg-surface-secondary`. Code blocks / overlays = `bg-surface-overlay`.
3. **Texto principal = `text-text-primary`** (flipea por tema). Secondary/tertiary para soporte; muted solo para hover state.
4. **Solo 3 tipos de botón**: Primary (`btn-primary`), Secondary ghost (`btn-secondary`), Navigation (transparent + altura de nav). No inventes "outline button rojo" — usá la receta `warning`/`danger` para esos casos.
5. **Acento `brand-primary` con moderación** — un solo CTA primary visible por pantalla. Resto secondary/ghost.
6. **Nunca pure black `#000000` ni white `#FFFFFF` hardcodeados** para texto. Usá `text-text-primary` (flipea).
7. **Border-radius ∈ {4, 6, 8, 9999}px** = `rounded-{sm,md,lg,full}`. Nada arbitrario.
8. **Spacing siempre múltiplo de 4**. `p-2.5` → no.
9. **Sombras solo `shadow-l1` o `shadow-l2`**, nunca ambas. L2 reservada para `btn-primary` y modales.
10. **Inputs**: usá la clase `.input` siempre. Si necesitás variante, mantené `border-medium` + `bg-input` + `rounded-md` + focus `border-brand-primary`.
11. **Nav header siempre 72px** (`h-18`) con `shadow-l1`. No varía.
12. **Tipografía**: Inter Variable para UI (`font-sans`), Berkeley Mono (`font-mono`) solo para código/SQL/identifiers. Cero serif.
13. **Tamaños tipográficos del scale** (`text-display-1/2/h3/h4/body/body-span/link/btn/code/code-sm`). Nada de `text-sm` random.
14. **Mobile**: padding `24px` → `16px` → `12px` según breakpoint. Touch target mínimo `44×44px`.

## Anti-patterns frecuentes en este proyecto

El estado actual del repo tiene patrones light-mode que hay que migrar:

- ❌ `bg-white`, `bg-gray-50` como fondos de containers principales.
- ❌ `bg-black text-white` para botones (era el "primary" pre-design-system).
- ❌ `text-gray-500`, `text-gray-400`, `text-gray-700` — reemplazar por `text-text-secondary` / `text-text-tertiary` / `text-text-primary`.
- ❌ `border`, `border-gray-300`, `border-gray-200` sobre dark — usar `border-white/[0.05]` o `border-white/[0.08]`.
- ❌ `rounded`, `rounded-lg` por default — explicitá `rounded-md` (6px) o `rounded-lg` (8px) según el caso.
- ❌ `text-sm`, `text-xs` con line-heights default — preferí los tamaños de la tabla de tipografía.
- ❌ `px-4 py-2` para botones — la altura debe ser 32px (`h-8`) y padding `px-3`.
- ❌ `bg-red-50 border-red-200 text-red-600` para errores — usá la receta `warning` o `danger` (ver tokens semánticos arriba).
- ❌ `bg-amber-50 text-amber-900 border-amber-200` para validation warnings — usá `bg-warning-bg/40 text-warning border-warning-border/40`.
- ❌ `text-red-600 hover:underline` para acciones destructivas — usá `text-danger hover:text-danger-hover hover:bg-danger-bg` (ghost) o agregá fondo si es CTA.

## Checklist antes de cerrar un cambio de UI

- [ ] ¿Background de la página es `bg-surface-primary`?
- [ ] ¿Todos los colores salen de los tokens semánticos (no hex arbitrarios, no `bg-white`/`bg-gray-X`)?
- [ ] ¿Probaste **light Y dark**? (toggle bottom-right). Sin contraste roto, sin elementos que desaparezcan.
- [ ] ¿Tipografía usa la escala (no `text-sm` random)?
- [ ] ¿Spacing es múltiplo de 4?
- [ ] ¿Hay un solo CTA primary visible?
- [ ] ¿Border-radius es 4/6/8/9999?
- [ ] ¿Inputs siguen la receta (`.input` o equivalente)?
- [ ] ¿Sombras solo en L1 (nav) o L2 (primary CTA / modal)?
- [ ] ¿Mobile: ningún elemento con touch target < 44px?

## AI affordances + motion (componentes shared)

Para reforzar el feel "producto con agentes" sin sobrecargar la UI sobria del sistema, hay 4 componentes en `src/components/ui/` que se usan en cualquier flujo agentic:

### `<AIBadge label="..." />`

Pill compacto mono-font + indigo tint. Marca contenido generado por un agente.

- Default label: `"AI"`. Usá labels específicos del rol del agente: `"Asesor"` (customer), `"Analyst"` (admin SQL), `"RAG"` (augment).
- Lugar: arriba de cada assistant bubble, al lado del título de paneles RAG/info, donde sea útil dar la affordance "esto lo hizo un LLM".

```tsx
<AIBadge label="Asesor" />
```

### `<Spinner size={16} />`

Anillo `border-2 border-brand-primary/20 border-t-brand-primary animate-spin`. Reemplaza spinners genéricos.

- Default size 16px. Variantes: 14 (chico, image upload), 16 (default), 24 (grande para hero loaders).
- Usalo en TODO contexto de loading, reemplazando spinners ad-hoc.

### `<PhaseDot active={isActive} />`

Dot que marca un nodo de un grafo de agente. Reemplaza el patrón "spinner cuando activo, ✓ cuando completo".

- `active={true}` → dot indigo sólido + `animate-ping` outward (está corriendo).
- `active={false}` → dot indigo opaco al 40% (ya completó).
- El ping del dot ya comunica "está corriendo" — **no agregues cursor parpadeante u otros loaders al lado del label**, queda redundante.

```tsx
{phaseLog.map((p, i) => {
  const isLast = i === phaseLog.length - 1;
  return (
    <div key={i} className="flex items-center gap-3 text-btn">
      <PhaseDot active={isLast} />
      <span className={isLast ? "text-text-primary" : "text-text-tertiary"}>
        {PHASE_LABELS[p]}
      </span>
    </div>
  );
})}
```

### `<AuroraBackground />`

3 radial-gradients borrosos en brand-primary/brand-accent. Se usa en empty states y heros.

- Container padre debe ser `relative`. El componente se posiciona absolute con `-z-10` y `pointer-events-none`.
- Funciona en ambos temas (las opacidades bajas + brand-primary constante hacen que se integre).

```tsx
<div className="relative ...">
  <AuroraBackground />
  ... contenido ...
</div>
```

## Motion + glow (utilities en globals.css / tailwind)

| Utility | Uso |
|---|---|
| `focus:ring-4 focus:ring-brand-primary/15` | Glow indigo en focus de inputs (ya en `.input`). |
| `.focus-glow` | Helper para chips/botones secondary que quieras "alive on focus". Solo activa con focus-visible (teclado). |
| `animate-fade-in` | Entrada suave para mensajes nuevos, phase log, modales. 200ms ease-out. |
| `animate-blink` | Cursor parpadeante. Disponible si necesitás un text-cursor en streaming real de tokens (no usar al lado de `<PhaseDot>` — redundante). |
| `animate-ping` (Tailwind) | Dot expandiéndose hacia afuera. Usado dentro de `<PhaseDot active>`. |
| `animate-spin` (Tailwind) | Rotación uniforme. Usado en `<Spinner />`. |
| `.dot-grid` | Background pattern técnico sutil. Aplicar a containers de páginas admin (ya en `/admin/layout.tsx`). |

## Reglas de motion

1. **Toda animación es sutil y funcional**, nunca decorativa. Si no comunica "algo está pasando", no va.
2. **Duraciones cortas**: 150–250ms para fade/transitions, 1100ms para blink, 1000ms para ping.
3. **`animate-fade-in` para entradas de contenido nuevo** (assistant bubble, phase log, modales). Da el feel "el agente entrega".
4. **`<PhaseDot>` para flujos agentic**. No uses `<Spinner>` para phases — el spinner es para "loading global" (image upload, fetch sin grafo). El ping del PhaseDot activo ya comunica "está corriendo"; no apiles otro loader al lado.
5. **`<AIBadge>` solo donde el contenido es generado por un agente.** No metas uno en cada texto random.
6. **Aurora solo en empty states y heros** — uno por pantalla máximo. No es decoración general.
7. **Dot-grid solo en backgrounds de páginas técnicas** (admin). Sin dot-grid sobre el chat del cliente.

## Cuándo cargar `DESIGN.md`

Cargá la referencia completa cuando necesites:
- Specs exactos de shadow L2 (multi-layer).
- Variantes de input (search, code).
- Layout grid + breakpoints detallados.
- Toda la lista de do/don'ts del sistema.
- Quick color reference para pasarle a otro agente.

Para edits puntuales (cambiar un botón, restilear un card), este SKILL.md alcanza.
