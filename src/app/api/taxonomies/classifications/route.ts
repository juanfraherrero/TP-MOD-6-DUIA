import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClassification } from "@/lib/services/taxonomies";

const inputSchema = z.object({
  name: z.string().min(1).max(120),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const created = await createClassification(parsed.data.name);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
