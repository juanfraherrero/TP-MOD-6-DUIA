import { NextRequest, NextResponse } from "next/server";
import { activityInputSchema } from "@/lib/validation/activity";
import { createActivity, listActivities } from "@/lib/services/activity";

export async function GET() {
  const items = await listActivities();
  return NextResponse.json(items);
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
