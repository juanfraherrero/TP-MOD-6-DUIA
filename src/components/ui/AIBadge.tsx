// Pill compacto que marca contenido generado por agentes (assistant bubble,
// fields aumentados, etc.). Tiene dos variantes: solid (sobre superficies
// off-white) y glass (sobre foto / glass-panel). Sobre glass el verde
// institucional pierde contraste, así que usamos white + dot verde.

type Variant = "solid" | "glass";

export function AIBadge({
  label = "AI",
  variant = "solid",
}: {
  label?: string;
  variant?: Variant;
}) {
  if (variant === "glass") {
    return (
      <span
        className="
          inline-flex items-center gap-1.5
          h-5 px-2
          rounded-full
          bg-glass-strong text-white
          border border-glass-strong
          font-mono text-[10px] font-medium
          uppercase tracking-wider
          select-none
          backdrop-blur-md
        "
      >
        <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
        {label}
      </span>
    );
  }

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
