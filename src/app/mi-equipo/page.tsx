import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MemberIntranetPage } from "../../components/member-intranet-page";
import { sessionUser } from "../../lib/management/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi aventura", robots: { index: false, follow: false } };

export default async function MiEquipoPage({ searchParams }: {
  searchParams: Promise<{ invitacion?: string; github?: string }>;
}) {
  const [store, params] = await Promise.all([cookies(), searchParams]);
  const invitationToken = params.invitacion && /^[a-f0-9]{64}$/.test(params.invitacion) ? params.invitacion : undefined;
  const user = await sessionUser(store.get(process.env.NODE_ENV === "production" ? "__Host-league-session" : "league-session")?.value);
  if (!user) redirect(invitationToken ? `/acceso?invitacion=${invitationToken}` : "/acceso");
  const staffAccount = user.is_owner || user.is_league_admin || ["pending", "approved"].includes(user.staff_status);
  return <MemberIntranetPage user={user} screen={invitationToken ? "team" : staffAccount ? "profile" : "adventure"}
    invitationToken={invitationToken} githubStatus={params.github} />;
}
