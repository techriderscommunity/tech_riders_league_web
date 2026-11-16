import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { MemberIntranetPage, type MemberScreen } from "../../../components/member-intranet-page";
import { sessionUser } from "../../../lib/management/service";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const screens: Record<string, MemberScreen> = {
  equipo: "team",
  misiones: "missions",
  rankings: "rankings",
  perfil: "profile",
  recursos: "resources",
};

export default async function MemberSectionPage({ params, searchParams }: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ mundo?: string }>;
}) {
  const [{ section }, query, store] = await Promise.all([params, searchParams, cookies()]);
  const screen = screens[section];
  if (!screen) notFound();
  const user = await sessionUser(store.get(process.env.NODE_ENV === "production" ? "__Host-league-session" : "league-session")?.value);
  if (!user) redirect("/acceso");
  return <MemberIntranetPage user={user} screen={screen} selectedWorldId={query.mundo} />;
}
