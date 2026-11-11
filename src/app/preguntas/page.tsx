import type { Metadata } from "next";
import { PaginaSeccion } from "../../components/pagina-seccion";
import { metadataPagina } from "../../lib/metadata";

export const metadata: Metadata = metadataPagina(
  "Preguntas frecuentes",
  "Respuestas públicas verificadas y cuestiones aún pendientes.",
  "/preguntas",
);

export default function PreguntasPage() {
  return <PaginaSeccion slug="preguntas" />;
}
