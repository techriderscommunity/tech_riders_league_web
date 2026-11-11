import type { Metadata } from "next";
import { PaginaSeccion } from "../../components/pagina-seccion";
import { metadataPagina } from "../../lib/metadata";

export const metadata: Metadata = metadataPagina(
  "Retos",
  "Estado de retos públicos y contenido validado para la temporada.",
  "/retos",
);

export default function RetosPage() {
  return <PaginaSeccion slug="retos" />;
}
