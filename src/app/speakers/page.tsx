import type { Metadata } from "next";
import { PaginaSeccion } from "../../components/pagina-seccion";
import { metadataPagina } from "../../lib/metadata";

export const metadata: Metadata = metadataPagina(
  "Speakers",
  "Información sobre speakers y sesiones únicamente cuando esté validada.",
  "/speakers",
  false,
);

export default function SpeakersPage() {
  return <PaginaSeccion slug="speakers" />;
}
