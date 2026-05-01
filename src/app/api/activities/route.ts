import { NextRequest, NextResponse } from "next/server";
import { activityInputSchema } from "@/lib/validation/activity";
import { createActivity, listActivities } from "@/lib/services/activity";

export async function GET(req: NextRequest) {
  // Paginación honesta vía query params. Defaults coinciden con el service
  // (page=1, size=20). El handler devuelve siempre el shape paginado.
  const url = new URL(req.url);
  const pageParam = Number(url.searchParams.get("page"));
  const sizeParam = Number(url.searchParams.get("size"));
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const pageSize =
    Number.isFinite(sizeParam) && sizeParam > 0 ? sizeParam : undefined;
  const result = await listActivities({ page, pageSize });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = activityInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const created = await createActivity(parsed.data);
  return NextResponse.json(created, { status: 201 });
}
