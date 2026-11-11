import type { Metadata } from "next";
import Image from "next/image";
import { TablaReglas } from "../../components/tabla-reglas";
import { obtenerRecorridoHome } from "../../lib/home";
import { metadataPagina } from "../../lib/metadata";
import styles from "./clasificacion.module.css";
import { publishedResults, type RankedTeam } from "../../lib/management/operations";

export const dynamic = "force-dynamic";

export const metadata: Metadata = metadataPagina(
  "Clasificación y premios",
  "Consulta los resultados por evento, la clasificación global, los criterios de puntuación y los premios.",
  "/clasificacion",
);

function PuestosPendientes({ limite, inicio = 1, ranking = [] }: { limite: number; inicio?: number; ranking?: RankedTeam[] }) {
  return (
    <table className={styles.scoreTable}>
      <caption className={styles.srOnly}>{ranking.length ? "Resultados publicados por organización" : "Plazas sin asignar · Resultados pendientes de validación"}</caption>
      <colgroup><col className={styles.positionColumn} /><col /><col className={styles.pointsColumn} /></colgroup>
      <thead>
        <tr>
          <th scope="col">Pos.</th>
          <th scope="col">Equipo</th>
          <th scope="col">Pts.</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: limite }, (_, indice) => (
          <tr key={indice}>
            <th scope="row">{String(indice + inicio).padStart(2, "0")}</th>
            <td>{ranking.find(r => r.posicion === indice + inicio)?.equipo ?? <span className={styles.emptySlot}>Por descubrir</span>}</td>
            <td>{ranking.find(r => r.posicion === indice + inicio)?.puntos ?? <span aria-label="Sin puntuación">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BanderaAventura() {
  return (
    <svg viewBox="0 0 128 112" aria-hidden="true" className={styles.flag}>
      <g shapeRendering="crispEdges">
        <path fill="#12558e" d="M27 21h8v81h-8zM18 102h27v6H18z" />
        <path fill="#8dfaff" d="M28 22h3v80h-3zM20 102h23v3H20z" />
        <path fill="#0c91ca" d="M35 28h19v-5h22v5h18v6h20v-5h8v12h-8v7h-13v8h13v6h8v7h-23v-5H79v-6H57v5H35z" />
        <path fill="#40d9f4" d="M35 28h19v-5h22v5h18v6h20v-5h8v5h-8v6H94v-6H76v-5H56v5H35zM35 58h22v-5h22v5h20v6h23v5H99v-5H79v-6H57v5H35z" />
        <path fill="#0871a8" d="M59 34h5v19h-5zM94 41h5v16h-5z" />
        <path fill="#e1ffff" d="M29 5h4v9h5v4h9v4h-9v5h-5v9h-4v-9h-5v-5h-9v-4h9v-4h5z" />
        <path fill="#e1ffff" d="M65 36h5v5h5v5h-5v5h-5v-5h-5v-5h5z" />
      </g>
    </svg>
  );
}

export default async function ClasificacionPage() {
  const recorrido = obtenerRecorridoHome();
  const { rankings } = await publishedResults();
  const global = rankings.global ?? [];

  return (
    <article className="page-content">
      <h1 className={styles.srOnly}>Clasificación y premios</h1>

      <section id="global" className={styles.podiumScene} aria-labelledby="podio-titulo">
        <div className={styles.sanctuary} aria-hidden="true">
          <span className={styles.tower} />
          <span className={styles.tower} />
        </div>
        <div className={styles.podiumHeading}>
          <p>Clasificación global</p>
          <h2 id="podio-titulo">{global.length ? "Las leyendas de la League" : "El podio espera a sus leyendas"}</h2>
          <p>{global.length ? "Clasificación revisada y publicada por organización." : "El viaje acaba de empezar. Todavía no hay equipos en el podio."}</p>
        </div>
        <div className={styles.podium}>
          {[2, 1, 3].map((puesto) => (
            <div className={styles.podiumPlace} data-place={puesto} key={puesto}>
              {puesto === 1 && <BanderaAventura />}
              <span className={styles.podiumName}>{global.find(r => r.posicion === puesto)?.equipo ?? "Por descubrir"}</span>
              <div className={styles.podiumBlock}>
                <span className={styles.podiumGem} aria-hidden="true" />
                <strong>{puesto}<span className={styles.srOnly}>.º puesto{global.find(r => r.posicion === puesto) ? "" : " sin asignar"}</span></strong>
                {global.find(r => r.posicion === puesto) ? <span>{global.find(r => r.posicion === puesto)?.puntos} pts.</span> : null}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.templeFloor} aria-hidden="true">
          <div className={styles.stairs} />
        </div>
        <div className={styles.remainingPlaces} aria-label="Puestos del cuarto al décimo">
          <PuestosPendientes limite={7} inicio={4} ranking={global} />
        </div>
        <p className={styles.podiumNote}>{global.length ? "Solo se muestran resultados publicados; las correcciones requieren nueva revisión." : "Las posiciones se asignarán con resultados validados."}</p>
      </section>

        <section id="por-evento" aria-labelledby="evento-titulo" className={styles.eventRankings}>
          <h2 id="evento-titulo">Los mejores de cada mundo</h2>
          <p className={styles.worldHint} id="ranking-mundos-ayuda">{Object.keys(rankings).some(k => k !== "global") ? "Resultados publicados por organización." : "Resultados pendientes de validación."} En pantallas pequeñas, desliza para ver los cinco mundos.</p>
          <div className={styles.worldViewport} role="region" aria-label="Clasificaciones de los cinco mundos" aria-describedby="ranking-mundos-ayuda" tabIndex={0}>
          <div className={styles.worldScene}>
            <Image src="/images/clasificacion-mundos.png" alt=""
              width={1152} height={768} sizes="(max-width: 1152px) 1152px, (max-width: 1600px) 100vw, 1600px"
              className={styles.worldArtwork} />
            {recorrido.map(({ numero, etapa }) => {
              const final = numero === recorrido.length;
              const clave = etapa?.slug ?? (final ? "hackathon" : `etapa-${numero}`);
              const titulo =
                etapa?.nombre.publicacion === "autorizada"
                  ? etapa.nombre.valor
                  : final ? "Hackathon final" : "Etapa pendiente";
              return (
                <section className={styles.eventBoard} data-world={numero} key={clave} aria-labelledby={`ranking-${clave}`}>
                  <header className={styles.srOnly}>
                    <h3 id={`ranking-${clave}`}>
                      {final ? titulo : <>Mundo {numero} · {titulo}</>}
                    </h3>
                  </header>
                  <PuestosPendientes limite={3} ranking={rankings[["negocio", "datos", "cloud", "seguridad", "hackathon"][numero - 1]] ?? []} />
                </section>
              );
            })}
          </div>
          </div>
        </section>

      <section id="premios" aria-labelledby="premios-titulo">
        <h2 id="premios-titulo">Premios</h2>
        <div className={styles.prizesGrid}>
          <div className={styles.rulesPanel}>
            <TablaReglas
              titulo="Clasificación general"
              columnas={["Posición", "Premio"]}
              filas={[
                ["1.º clasificado", "750 €"],
                ["2.º clasificado", "500 €"],
                ["3.º clasificado", "250 €"],
                ["Total", "1.500 €"],
              ]}
            />
          </div>
          <div className={styles.rulesPanel}>
            <h3>Premios por evento</h3>
            <p className={styles.sponsorPending}>Pendientes de sponsor</p>
            <p>Los premios de cada evento se anunciarán cuando estén confirmados.</p>
          </div>
          <div className={styles.rulesPanel}>
            <h3>Sorteo de 30 vouchers Fundamentals</h3>
            <p>Se sortearán <strong>5 por cada mundo</strong> y <strong>10 en el hackathon final</strong>.</p>
          </div>
        </div>
        <p>Las bases y condiciones se publicarán con el reglamento aprobado.</p>
      </section>
    </article>
  );
}
