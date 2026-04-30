// Fondo "aurora" con 3 radial gradients borrosos en brand-primary / brand-accent.
// Pensado para empty states del cliente — el "wow moment" del primer load.
//
// Es un layer absoluto + pointer-events-none + z-index detrás del contenido.
// No afecta layout. Funciona en ambos temas porque las opacidades son bajas
// y los colores del brand son theme-agnostic.

export function AuroraBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute -top-20 -left-20 h-[420px] w-[420px] rounded-full bg-brand-primary/[0.18] blur-[100px]" />
      <div className="absolute -bottom-32 -right-20 h-[380px] w-[380px] rounded-full bg-brand-accent/[0.15] blur-[100px]" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-[260px] w-[260px] rounded-full bg-brand-primary/[0.12] blur-[100px]" />
    </div>
  );
}
