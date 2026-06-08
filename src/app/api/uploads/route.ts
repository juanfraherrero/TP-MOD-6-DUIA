import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { type NextRequest, NextResponse } from "next/server";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads");
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_SIZE = 5 * 1024 * 1024;

// En Vercel el filesystem de la función serverless es read-only, así que
// escribir a public/uploads/ falla con EROFS y deja un 500 críptico. Detectamos
// el entorno y devolvemos un 501 explícito; en local sigue funcionando igual.
const isReadOnlyFs = !!process.env.VERCEL;

export async function POST(req: NextRequest) {
  if (isReadOnlyFs) {
    return NextResponse.json(
      {
        error:
          "Las subidas de imagen están deshabilitadas en este deploy (filesystem read-only). Usá imageUrl con un link externo.",
      },
      { status: 501 },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Tipo de archivo no permitido (jpeg/png/webp/gif)" },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "Archivo demasiado grande (máx 5MB)" },
      { status: 400 },
    );
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = extname(file.name) || ".bin";
  const filename = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(UPLOAD_DIR, filename), buffer);

  return NextResponse.json({ url: `/uploads/${filename}` });
}
