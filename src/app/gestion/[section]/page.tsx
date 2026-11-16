import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ManagementIntranetPage, type ManagementScreen } from "../../../components/management-intranet-page";
import { sessionUser } from "../../../lib/management/service";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const screens: Record<string, ManagementScreen> = {
  mundos: "worlds",
  retos: "challenges",
  entregas: "deliveries",
  evaluaciones: "evaluations",
  equipos: "teams",
  participantes: "participants",
  puntos: "points",
  "solicitudes-staff": "staff",
  staff: "staff-directory",
  comunidad: "community",
};

export default async function ManagementSectionPage({ params, searchParams }: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ buscar?: string; equipo?: string; mundo?: string }>;
}) {
  const [{ section }, query, store] = await Promise.all([params, searchParams, cookies()]);
  const screen = screens[section];
  if (!screen) notFound();
  const user = await sessionUser(store.get(process.env.NODE_ENV === "production" ? "__Host-league-session" : "league-session")?.value);
  if (!user) redirect("/acceso");
  return <ManagementIntranetPage user={user} screen={screen} search={query.buscar ?? query.equipo ?? ""} selectedWorldId={query.mundo} />;
}
