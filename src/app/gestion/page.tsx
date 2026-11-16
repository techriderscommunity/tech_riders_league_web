import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ManagementIntranetPage } from "../../components/management-intranet-page";
import { sessionUser } from "../../lib/management/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gestión", robots: { index: false, follow: false } };

export default async function GestionPage() {
  const store = await cookies();
  const user = await sessionUser(store.get(process.env.NODE_ENV === "production" ? "__Host-league-session" : "league-session")?.value);
  if (!user) redirect("/acceso");
  return <ManagementIntranetPage user={user} screen="control" />;
}
