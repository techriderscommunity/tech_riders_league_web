import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionUser } from "../../../../lib/management/service";
import { finishGitHub } from "../../../../lib/management/github";
import { appUrl } from "../../../../lib/management/mail";
import { ManagementError } from "../../../../lib/management/validation";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const store = await cookies();
    const session = store.get(process.env.NODE_ENV === "production" ? "__Host-league-session" : "league-session")?.value;
    const user = await sessionUser(session);
    if (!user || !session) throw new ManagementError("Inicia sesión antes de vincular GitHub.", 401);
    const params = new URL(request.url).searchParams;
    if (params.has("error")) throw new ManagementError("No autorizaste la vinculación con GitHub.", 403);
    await finishGitHub(user, session, { code: params.get("code"), state: params.get("state") });
    return NextResponse.redirect(`${appUrl()}/mi-equipo?github=linked`, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    if (!(error instanceof ManagementError)) console.error("GitHub callback failed", { error: "Transport or configuration failure" });
    return NextResponse.redirect(`${appUrl()}/mi-equipo?github=error`, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
}
