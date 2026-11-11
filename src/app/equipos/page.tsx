import type { Metadata } from "next";
import { EquiposTemporada } from "../../components/equipos-temporada";
import { EstadoPublico } from "../../components/estado-publico";
import { obtenerSeccion } from "../../lib/contenido";
import { metadataPagina } from "../../lib/metadata";

export const metadata: Metadata = metadataPagina(
  "Equipos",
  "Reglas públicas de composición y continuidad de equipos.",
  "/equipos",
);

export default function EquiposPage() {
  const equipos = obtenerSeccion("equipos");
  return (
    <article className="page-content">
      <header className="page-heading">
        <h1>Equipos</h1>
        <p className="lead">{equipos.descripcion}</p>
      </header>
      <EquiposTemporada />
      <EstadoPublico dato={equipos.datosAdicionales.directorio} titulo="Directorio público" />
    </article>
  );
}
