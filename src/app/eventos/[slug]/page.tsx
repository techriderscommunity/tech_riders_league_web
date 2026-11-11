import { notFound, redirect } from "next/navigation";
import { obtenerEvento } from "../../../lib/contenido";

export default async function EventoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const evento = obtenerEvento(slug);
  if (evento === undefined) {
    notFound();
  }
  redirect(`/eventos?etapa=${evento.slug}#detalle-etapa`);
}
