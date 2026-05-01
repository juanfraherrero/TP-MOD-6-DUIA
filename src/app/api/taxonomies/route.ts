import { NextResponse } from "next/server";
import {
  listClassifications,
  listDepartments,
} from "@/lib/services/taxonomies";

export async function GET() {
  const [departments, classifications] = await Promise.all([
    listDepartments(),
    listClassifications(),
  ]);
  return NextResponse.json({ departments, classifications });
}
