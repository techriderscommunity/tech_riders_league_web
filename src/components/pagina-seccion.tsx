import { obtenerSeccion } from "../lib/contenido";
import { EstadoPublico } from "./estado-publico";
import { EventoIlustracion } from "./evento-ilustracion";

export function PaginaSeccion({ slug }: { slug: string }) {
  const seccion = obtenerSeccion(slug);
  return (
    <article className="page-content">
      <header className="page-heading">
        <p className="eyebrow">Tech Riders League 2027</p>
        <h1>{seccion.titulo}</h1>
        <p className="lead">{seccion.descripcion}</p>
      </header>
      {slug === "hackathon" ? (
        <EventoIlustracion
          numero={5}
          clase="event-detail-artwork"
          prioridad
        />
      ) : null}
      <section className="page-data" aria-label="Información de la sección">
        <EstadoPublico dato={seccion.contenido} titulo="Información principal" />
        {Object.entries(seccion.datosAdicionales).map(([key, dato]) => (
          <EstadoPublico
            key={key}
            dato={dato}
            titulo={
              key === "directorio"
                ? "Directorio público"
                : key === "reglamento"
                  ? "Reglamento"
                  : key === "desempates"
                    ? "Criterios de desempate"
                    : key
            }
          />
        ))}
      </section>
    </article>
  );
}
