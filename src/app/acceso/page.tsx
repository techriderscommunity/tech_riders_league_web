import { AccessContent } from "../../components/access-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acceso", robots: { index: false, follow: false } };

export default async function AccesoPage({ searchParams }: {
  searchParams: Promise<{ token?: string; purpose?: string; invitacion?: string; activado?: string }>;
}) {
  const params = await searchParams;
  return <article className="page-content management-page">
    <h1>{params.token && ["verify", "reset"].includes(params.purpose ?? "") ? "Activar acceso" : "Accede a la League"}</h1>
    {params.activado === "1" ? <p role="status">Acceso activado. Ya puedes iniciar sesión.</p> : null}
    <AccessContent params={params} />
  </article>;
}
