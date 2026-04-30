// Pill compacto que marca contenido generado por agentes (assistant bubble,
// fields aumentados, etc.). Usa brand-primary tint + mono font para reforzar
// la affordance "esto lo escribió un agente".

export function AIBadge({ label = "AI" }: { label?: string }) {
  return (
    <span
      className="
        inline-flex items-center gap-1
        h-5 px-1.5
        rounded-full
        bg-brand-primary/10 text-brand-accent
        border border-brand-primary/20
        font-mono text-[10px] font-medium
        uppercase tracking-wider
        select-none
      "
    >
      <span className="h-1 w-1 rounded-full bg-brand-accent" />
      {label}
    </span>
  );
}
