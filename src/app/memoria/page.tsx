import type { Metadata } from "next";
import { metadataPagina } from "../../lib/metadata";
import { database } from "../../lib/management/db";
import { hallOfFame } from "../../lib/management/github";

export const dynamic = "force-dynamic";

export const metadata: Metadata = metadataPagina(
  "Memoria",
  "Recursos públicos y memoria de temporada cuando estén autorizados.",
  "/memoria",
);

export default async function MemoriaPage() {
  const rows = process.env.DATABASE_URL ? (await database().query<{ id: string; name: string; description: string; resource_url: string }>(
    "SELECT id,name,description,resource_url FROM contributions WHERE authorized AND resource_url IS NOT NULL ORDER BY name")).rows : [];
  const solutions = await hallOfFame();
  return <article className="page-content"><h1>Recursos y memoria de la League</h1>
    <p>Contenidos publicados con autorización de sus colaboradores.</p>
    {!rows.length ? <p>Todavía no hay recursos publicados.</p> : <ul>{rows.map(r => <li key={r.id}><a href={r.resource_url} target="_blank" rel="noopener noreferrer">{r.name}</a><p>{r.description}</p></li>)}</ul>}
    <section><h2>Las crónicas del mundo han sido reveladas</h2>
      <p>Hall of Fame técnico: soluciones del Top 3 de cada mundo integradas por organización en el repositorio oficial.</p>
      {!solutions.length ? <p>Todavía no se han revelado soluciones.</p> : <ul>{solutions.map(s => <li key={s.id}><a href={s.pr_url} target="_blank" rel="noopener noreferrer">{s.event_id} · Top {s.position} · Solución publicada</a></li>)}</ul>}
    </section>
  </article>;
}
