"use client";

// Mini-mapa embebido vía OpenStreetMap (sin API key, sin tracking de Google).
// Render como iframe; debajo, link a Google Maps para "abrir afuera". Diseñado
// para vivir sobre fondos glass (customer card) — usa border-white/10 + bg
// glass-on-glass.

type MiniMapProps = {
  lat: number;
  lng: number;
  zoom?: number;
  height?: number;
  title?: string;
};

export function MiniMap({ lat, lng, height = 200, title }: MiniMapProps) {
  // Bbox apretado alrededor del punto (~500m de radio aproximado, varía con
  // la latitud). Suficiente para ubicar visualmente sin perder contexto.
  const span = 0.005;
  const bbox = `${lng - span},${lat - span},${lng + span},${lat + span}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  const externalHref = `https://www.google.com/maps?q=${lat},${lng}`;
  const iframeTitle = title ? `Mapa de ${title}` : "Mapa de la ubicación";

  return (
    <div className="space-y-2">
      <div
        className="w-full overflow-hidden rounded-lg border border-white/10"
        style={{ height }}
      >
        <iframe
          title={iframeTitle}
          src={src}
          loading="lazy"
          className="w-full h-full block border-0"
        />
      </div>
      <a
        href={externalHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/10 text-white border border-white/15 hover:bg-white/15 text-code-sm transition-colors"
      >
        <span aria-hidden="true">↗</span>
        Abrir en Google Maps
      </a>
    </div>
  );
}
