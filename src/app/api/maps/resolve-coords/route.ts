import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createLogger } from "@/lib/logger";
import { parseCoordsFromMapsUrl } from "@/lib/maps/parse-coords";

const log = createLogger("api:maps:resolve");

const inputSchema = z.object({
  url: z.string().url(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "URL inválida" },
      { status: 400 },
    );
  }

  const { url } = parsed.data;
  log.info("resolve coords", { url });

  // 1) Parse directo: si la URL ya tiene `@lat,lng` o `!3d!4d`, no hace
  // falta tocar la red.
  const direct = parseCoordsFromMapsUrl(url);
  if (direct) {
    log.info("matcheada client-side-style", direct);
    return NextResponse.json(direct);
  }

  // 2) Resolver redirects (caso típico: maps.app.goo.gl). Google a veces
  // devuelve 403 sin User-Agent de browser. Timeout corto: si no responde
  // en 5s, declaramos derrota.
  const end = log.time("fetch redirect");
  let finalUrl: string;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    finalUrl = res.url;
  } catch (err) {
    end();
    log.warn("fetch falló", { url, error: String(err) });
    return NextResponse.json(
      { error: "No pude resolver esa URL (timeout o red caída)" },
      { status: 422 },
    );
  }
  end();

  const resolved = parseCoordsFromMapsUrl(finalUrl);
  if (resolved) {
    log.info("matcheada tras redirect", { ...resolved, finalUrl });
    return NextResponse.json(resolved);
  }

  log.warn("ningún regex matcheó", { url, finalUrl });
  return NextResponse.json(
    { error: "No pude extraer coordenadas de esa URL" },
    { status: 422 },
  );
}
