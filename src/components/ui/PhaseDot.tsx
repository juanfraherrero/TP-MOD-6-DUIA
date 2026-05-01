// Dot que marca un nodo de un grafo de agente.
// - active=true → brand-primary sólido + animate-ping outward (está corriendo).
// - active=false → brand-primary opaco al 40% (ya completó).

export function PhaseDot({ active }: { active: boolean }) {
  if (!active) {
    return (
      <span className="inline-flex h-2 w-2 rounded-full bg-brand-primary/40 shrink-0" />
    );
  }
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75 animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-primary" />
    </span>
  );
}
