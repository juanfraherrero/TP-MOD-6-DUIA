// Spinner del sistema — anillo con brand-primary como "cabeza" sobre brand-primary/20.
// Da el feel "un agente está pensando" más que un loader genérico.

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <div
      role="status"
      aria-label="Cargando"
      className="rounded-full border-2 border-brand-primary/20 border-t-brand-primary animate-spin"
      style={{ width: size, height: size }}
    />
  );
}
