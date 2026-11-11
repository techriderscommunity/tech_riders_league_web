import { AccessContent } from "../../components/access-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acceso", robots: { index: false, follow: false } };

export default async function AccesoPage({ searchParams }: {
  searchParams: Promise<{ token?: string; purpose?: string; invitacion?: string }>;
}) {
  return <article className="page-content management-page">
    <h1>Accede a la League</h1>
    <AccessContent params={await searchParams} />
  </article>;
}
