import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionUser, requireStaff } from "../../../../lib/management/service";
import { database } from "../../../../lib/management/db";
import { ManagementError } from "../../../../lib/management/validation";

export const dynamic = "force-dynamic";
export function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export async function GET() {
  try {
    const store = await cookies();
    const user = await sessionUser(store.get(process.env.NODE_ENV === "production" ? "__Host-league-session" : "league-session")?.value);
    if (!user) throw new ManagementError("Debes iniciar sesión.", 401);
    requireStaff(user);
    const data = await database().query<{ team: string; status: string; world: string; first_name: string; last_name: string; email: string; original: boolean; active: boolean; luma: boolean; present: boolean; at_end: boolean }>(
      `SELECT t.name AS team,t.status,e.name AS world,u.first_name,u.last_name,u.email,r.original,r.active,
        COALESCE(a.luma,false) AS luma,COALESCE(a.present,false) AS present,COALESCE(a.at_end,false) AS at_end
       FROM teams t JOIN league_events e ON e.season=t.season
       JOIN (SELECT team_id,user_id,original,active,NULL::text AS event_id FROM members
         UNION ALL SELECT team_id,user_id,false,true,event_id FROM substitutions) r
         ON r.team_id=t.id AND (r.event_id IS NULL OR r.event_id=e.id)
       JOIN users u ON u.id=r.user_id
       LEFT JOIN attendance a ON a.team_id=t.id AND a.event_id=e.id AND a.user_id=u.id
       ORDER BY t.name,e.ordinal,r.original DESC,u.email`);
    const rows = [["Equipo", "Estado", "Mundo", "Nombre", "Apellidos", "Correo Luma", "Original", "Activo", "Luma validado", "Asistencia", "Presente al final"],
      ...data.rows.map(p => [p.team, p.status, p.world, p.first_name, p.last_name, p.email, ...[p.original, p.active, p.luma, p.present, p.at_end].map(v => v ? "Sí" : "No")])];
    return new Response(`\uFEFF${rows.map(r => r.map(csvCell).join(";")).join("\r\n")}`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="league-equipos-asistencia.csv"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    if (error instanceof ManagementError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Management export failed", error);
    return NextResponse.json({ error: "No se pudo exportar. Contacta con organización." }, { status: 503 });
  }
}
