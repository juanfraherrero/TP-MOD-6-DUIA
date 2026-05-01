// Helper compartido cliente/servidor: extrae lat/lng de una URL de Google Maps
// expandida. Cubre los dos formatos canónicos:
//   1) `.../@-29.4131,-66.8559,17z/...`        → matchea `@LAT,LNG`
//   2) `.../!3d-29.4131!4d-66.8559/...`        → matchea `!3dLAT!4dLNG` (place data)
// URLs cortas tipo `maps.app.goo.gl/...` requieren resolver redirects antes
// (eso lo hace el endpoint server-side `/api/maps/resolve-coords`).

const AT_RE = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
const BANG_RE = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;

export function parseCoordsFromMapsUrl(
  url: string,
): { lat: number; lng: number } | null {
  const at = url.match(AT_RE);
  if (at) {
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (isValid(lat, lng)) return { lat, lng };
  }
  const bang = url.match(BANG_RE);
  if (bang) {
    const lat = Number(bang[1]);
    const lng = Number(bang[2]);
    if (isValid(lat, lng)) return { lat, lng };
  }
  return null;
}

function isValid(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
