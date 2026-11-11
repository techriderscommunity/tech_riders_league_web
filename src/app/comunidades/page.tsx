import type { Metadata } from "next";
import Link from "next/link";
import { EstadoPublico } from "../../components/estado-publico";
import { ImagenOrganizacion } from "../../components/imagen-organizacion";
import { obtenerSeccion } from "../../lib/contenido";
import { metadataPagina } from "../../lib/metadata";

export const metadata: Metadata = metadataPagina(
  "Comunidades",
  "Conoce la organización, las comunidades anfitrionas confirmadas y quién grabará las sesiones de la League.",
  "/comunidades",
);

export default function ComunidadesPage() {
  const comunidades = obtenerSeccion("comunidades");

  return (
    <article className="page-content">
      <header className="page-heading">
        <p className="eyebrow">Tech Riders League 2027</p>
        <h1>Comunidades</h1>
        <p className="lead">
          La League conecta a Tech Riders con comunidades anfitrionas y
          colaboradores que ayudan a compartir cada etapa.
        </p>
      </header>

      <section aria-labelledby="organizacion-titulo">
        <h2 id="organizacion-titulo">Organización y contenido</h2>
        <div className="community-partners">
          <article className="card">
            <p className="community-role">Organización principal</p>
            <h3>Tech Riders</h3>
            <p>
              Tech Riders organiza la League y coordina el recorrido de la
              temporada.
            </p>
          </article>
          <article className="card">
            <ImagenOrganizacion
              nombre="SirviendoCodigo"
              clase="community-partner-image"
              prioridad
            />
            <p className="community-role">Grabación y contenidos</p>
            <h3>SirviendoCodigo</h3>
            <p>
              Grabará todas las sesiones y otros contenidos de la Tech Riders
              League para que la experiencia pueda compartirse más allá de cada
              evento.
            </p>
          </article>
        </div>
      </section>

      <section aria-labelledby="anfitrionas-titulo">
        <h2 id="anfitrionas-titulo">Comunidades anfitrionas</h2>
        <article className="card community-confirmed">
          <ImagenOrganizacion
            nombre="Guarandinga"
            clase="community-partner-image"
          />
          <div>
            <p className="community-role">
              Mundo 1 · Negocio y Arquitectura
            </p>
            <h3>Guarandinga</h3>
            <p>
              Comunidad anfitriona confirmada del Mundo 1.
            </p>
            <Link href="/eventos?etapa=negocio-arquitectura#detalle-etapa">
              Ver Mundo 1 en el mapa
            </Link>
          </div>
        </article>
        <div className="page-data">
          <EstadoPublico
            dato={comunidades.contenido}
            titulo="Estado de las comunidades"
          />
        </div>
      </section>
    </article>
  );
}
