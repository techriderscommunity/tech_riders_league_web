import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionUser } from "../../../../../lib/management/service";
import { downloadSubmission } from "../../../../../lib/management/github";
import { ManagementError } from "../../../../../lib/management/validation";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const store = await cookies();
    const user = await sessionUser(store.get(process.env.NODE_ENV === "production" ? "__Host-league-session" : "league-session")?.value);
    if (!user) throw new ManagementError("Debes iniciar sesión.", 401);
    const { zip, sha } = await downloadSubmission(user, (await context.params).id);
    return new Response(new Uint8Array(zip), { headers: {
      "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="league-${sha}.zip"`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    } });
  } catch (error) {
    if (error instanceof ManagementError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("GitHub snapshot read failed", { error: "Integrity, transport or configuration failure" });
    return NextResponse.json({ error: "No se pudo recuperar la entrega privada." }, { status: 503 });
  }
}
