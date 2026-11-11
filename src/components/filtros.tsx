import Link from "next/link";
import type { EtapaPublica } from "../lib/contenido";

export function Filtros({
  etapas,
  seleccion,
}: {
  etapas: readonly EtapaPublica[];
  seleccion?: string;
}) {
  return (
    <form className="filter-form" action="/eventos" method="get">
      <label htmlFor="etapa">Filtrar eventos por etapa</label>
      <select id="etapa" name="etapa" defaultValue={seleccion ?? ""}>
        <option value="">Todas las etapas</option>
        {etapas.map((etapa) => (
          <option key={etapa.slug} value={etapa.slug}>
            {etapa.nombre.publicacion === "autorizada"
              ? etapa.nombre.valor
              : "Etapa pendiente"}
          </option>
        ))}
      </select>
      <button type="submit">Aplicar filtro</button>
      {seleccion === undefined ? null : <Link href="/eventos">Quitar filtro</Link>}
    </form>
  );
}
