import { NextRequest, NextResponse } from "next/server";
import { activityInputSchema } from "@/lib/validation/activity";
import {
  deleteActivity,
  getActivity,
  updateActivity,
} from "@/lib/services/activity";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const activity = await getActivity(id);
  if (!activity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(activity);
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const parsed = activityInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const updated = await updateActivity(id, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const ok = await deleteActivity(id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
