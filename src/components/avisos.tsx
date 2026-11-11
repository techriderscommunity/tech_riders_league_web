import { obtenerSeccion } from "../lib/contenido";
import { EstadoPublico } from "./estado-publico";

export function Avisos() {
  const avisos = obtenerSeccion("avisos");
  return (
    <aside className="notice" aria-labelledby="avisos-titulo">
      <h2 id="avisos-titulo">{avisos.titulo}</h2>
      <p>{avisos.descripcion}</p>
      <EstadoPublico dato={avisos.contenido} />
    </aside>
  );
}
