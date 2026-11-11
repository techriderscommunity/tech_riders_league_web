import Link from "next/link";
import type { Metadata } from "next";
import { EstadoPublico } from "../../components/estado-publico";
import {
  EventoIlustracion,
  numeroIlustracionEvento,
} from "../../components/evento-ilustracion";
import { ImagenOrganizacion } from "../../components/imagen-organizacion";
import { MapaAventura } from "../../components/mapa-aventura";
import { obtenerRecorridoHome } from "../../lib/home";
import { obtenerSeccion } from "../../lib/contenido";
import { metadataPagina } from "../../lib/metadata";
import { obtenerInscripcionMundo } from "../../lib/inscripcion";

export const metadata: Metadata = metadataPagina(
  "Mapa de la aventura",
  "Explora los cuatro mundos —Negocio y Arquitectura, Datos, Cloud y Ciberseguridad— y el hackathon final.",
  "/eventos",
);

export default async function EventosPage({
  searchParams,
}: {
  searchParams: Promise<{ etapa?: string }>;
}) {
  const { etapa: seleccion } = await searchParams;
  const paradas = obtenerRecorridoHome().map(({ numero, etapa }) => ({
    numero,
    etapa,
    clave: etapa?.slug ?? (numero === 5 ? "hackathon" : `etapa-${numero}`),
    titulo:
      etapa?.nombre.publicacion === "autorizada"
        ? etapa.nombre.valor
        : numero === 5
          ? "Hackathon final"
          : "Etapa pendiente",
  }));
  const paradaInicial = paradas[0];
  if (paradaInicial === undefined) {
    throw new RangeError("El mapa de la aventura no contiene etapas.");
  }
  const paradaActiva =
    paradas.find((parada) => parada.clave === seleccion) ?? paradaInicial;
  const seleccionInvalida =
    seleccion !== undefined &&
    !paradas.some((parada) => parada.clave === seleccion);
  const hackathon = obtenerSeccion("hackathon");
  const mundos = paradas.map((parada) => {
    const paradaActiva = parada;
    const ilustracionActiva =
      paradaActiva.etapa === undefined
        ? paradaActiva.numero === paradas.length
          ? 5
          : undefined
        : numeroIlustracionEvento(paradaActiva.etapa.slug);
    if (ilustracionActiva === undefined) {
      throw new RangeError(
        `No hay ilustración para la etapa ${paradaActiva.numero}.`,
      );
    }
    return {
      clave: parada.clave,
      inscripcion: obtenerInscripcionMundo(parada.clave).url,
      titulo: parada.titulo,
      etiqueta:
        parada.numero === paradas.length
          ? "Mundo final"
          : `Mundo ${parada.numero}`,
      detalle: (
        <section
          className="adventure-detail"
          id="detalle-etapa"
          aria-labelledby="detalle-titulo"
        >
          {paradaActiva.etapa?.slug !== "negocio-arquitectura" ? (
          <div className="adventure-detail-intro">
            <EventoIlustracion
              numero={ilustracionActiva}
              clase="event-detail-artwork"
            />
            <div className="adventure-detail-content">
              <p className="eyebrow">
                {paradaActiva.numero === paradas.length
                  ? "Mundo final"
                  : `Mundo ${paradaActiva.numero}`}
              </p>
              <h2 id="detalle-titulo">{paradaActiva.titulo}</h2>
              {paradaActiva.etapa !== undefined ? (
                <div
                  className="event-meta"
                  aria-label="Fecha y comunidad anfitriona"
                >
                  <div className="event-meta-item">
                    <span className="event-meta-label">Fecha</span>
                    <span className="event-meta-value">
                      {paradaActiva.etapa.fecha.publicacion === "autorizada"
                        ? paradaActiva.etapa.fecha.valor
                        : "Pendiente de confirmar"}
                    </span>
                  </div>
                  <div className="event-meta-item">
                    <span className="event-meta-label">
                      Comunidad anfitriona
                    </span>
                    <span className="event-meta-value">
                      {paradaActiva.etapa.comunidad.publicacion === "autorizada"
                        ? paradaActiva.etapa.comunidad.valor
                        : "Pendiente de confirmar"}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          ) : null}
          {paradaActiva.etapa === undefined &&
            paradaActiva.numero !== paradas.length ? (
            <div className="pending-stage" role="status">
              <strong>Pendiente de publicación</strong>
              <p>
                El nombre, la fecha, la comunidad anfitriona y los detalles de
                esta etapa se mostrarán cuando estén confirmados.
              </p>
            </div>
          ) : null}
          {paradaActiva.etapa === undefined &&
            paradaActiva.numero === paradas.length ? (
            <EstadoPublico
              dato={hackathon.contenido}
              titulo="Información de la final"
            />
          ) : null}
          {paradaActiva.etapa?.slug === "negocio-arquitectura" ? (
            <aside className="world-guide">
              <ImagenOrganizacion
                nombre="Guarandinga"
                clase="world-guide-image"
              />
              <div>
                <h2 id="detalle-titulo">El Reino de las Decisiones</h2>
                <p>
                  <em>
                    Las grandes aventuras no siempre comenzarán con una batalla.
                    Algunas empezarán con un cliente pronunciando las palabras
                    más temidas de todos los reinos: «Es una cosa sencilla…».
                  </em>
                </p>
                <p>
                  <em>Fragmento de las Crónicas de Codechito</em>
                </p>
                <p>
                  Techito y Codechito llegarán al <strong>Reino de las Decisiones</strong>,
                  donde los estará esperando <strong>Guarandinchito</strong>,
                  guardián del primer mundo. Allí encontrarán el encargo que dará
                  comienzo a la League: un problema de negocio, unas cuantas
                  restricciones y suficientes requisitos ambiguos como para llenar
                  varias mazmorras.
                </p>
                <p>
                  Juntos tendrán que descubrir qué necesita realmente el cliente
                  y qué camino deberá tomar la solución. Por el mapa aparecerán
                  rutas tentadoras: <strong>Microservicios</strong>,{" "}
                  <strong>Clean Architecture</strong>, <strong>eventos</strong>,{" "}
                  <strong>Azure</strong>… e incluso el legendario sendero de{" "}
                  <em>«metamos IA, que seguro que aporta valor»</em>.
                </p>
                <p>
                  Pero en este reino ninguna tecnología otorgará puntos de
                  experiencia simplemente por utilizarla.
                </p>
                <p>
                  Techito propondrá alternativas, Guarandinchito pondrá a prueba
                  cada decisión y <strong>Codechito lo grabará todo para las
                  Crónicas de la League</strong>, incluidas aquellas decisiones que
                  alguno preferiría olvidar. Tendrán que convertir las necesidades
                  del negocio en una arquitectura que puedan defender, preparar
                  sus primeras misiones y decidir qué riesgos estarán dispuestos
                  a asumir.
                </p>
                <p>
                  Porque cada camino que elijan en este primer mundo tendrá
                  consecuencias en los siguientes.
                </p>
                <p>
                  Cuando abandonen el reino llevarán consigo algo más importante
                  que un diagrama lleno de cajas y flechas: <strong>una dirección,
                  una arquitectura y un motivo para cada decisión tomada</strong>.
                </p>
                <p>
                  Guarandinchito contemplará el camino que se abrirá ante ellos.
                </p>
                <p>
                  <strong>
                    «Bien. Ahora ya sabemos qué vamos a construir. Veamos si
                    sobrevive al viaje.»
                  </strong>
                </p>
                <p>Codechito hará una última grabación antes de partir:</p>
                <p>
                  <strong>
                    «Primer mundo superado. Arquitectura decidida. De momento,
                    ningún microservicio ha resultado herido.»
                  </strong>
                </p>
                <p>
                  Y los tres pondrán rumbo a su siguiente aventura.
                </p>
              </div>
            </aside>
          ) : null}
          {paradaActiva.etapa !== undefined &&
          paradaActiva.etapa.slug !== "negocio-arquitectura" ? (
            <EstadoPublico
              dato={paradaActiva.etapa.descripcion}
              titulo="Agenda y detalles"
            />
          ) : null}
          {paradaActiva.etapa === undefined &&
            paradaActiva.numero === paradas.length ? (
            <Link href="/participacion">Cómo participar en la League</Link>
          ) : null}
        </section>
      ),
    };
  });

  return (
    <article className="page-content">
      {seleccionInvalida ? (
        <p role="status">
          No reconocemos esa parada. Mostramos la primera etapa.
        </p>
      ) : null}
      <MapaAventura
        mundos={mundos}
        seleccion={seleccion === undefined ? undefined : paradaActiva.clave}
      />
    </article>
  );
}
