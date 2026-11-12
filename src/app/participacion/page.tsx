import type { Metadata } from "next";
import Link from "next/link";
import { EstadoPublico } from "../../components/estado-publico";
import { obtenerSeccion } from "../../lib/contenido";
import { metadataPagina } from "../../lib/metadata";
import { EquiposTemporada } from "../../components/equipos-temporada";
import { TablaReglas } from "../../components/tabla-reglas";
import styles from "../clasificacion/clasificacion.module.css";
import { eventosInscripcion } from "../../lib/inscripcion";
import inscripcionStyles from "./participacion.module.css";
export const dynamic = "force-dynamic";

export const metadata: Metadata = metadataPagina(
  "Cómo participar",
  "Inscríbete en los cinco eventos de Luma, forma tu equipo y consulta las reglas de participación.",
  "/participacion",
);

export default function ParticipacionPage() {
  const puntuacion = obtenerSeccion("puntuacion");

  return (
    <article className="page-content">
      <h1 className="sr-only">Cómo participar</h1>
      <EquiposTemporada />

      <section id="puntuacion" aria-labelledby="puntuacion-titulo">
        <h2 id="puntuacion-titulo">Sistema de puntuación</h2>
        <div className={styles.rulesGrid}>
          <div className={styles.rulesPanel}>
            <TablaReglas
              titulo="Puntuación base"
              columnas={["Acción", "Puntos"]}
              filas={[
                ["Asistencia de equipo", "50"],
                ["Foto de equipo etiquetando comunidades y sponsors", "50"],
                ["Entrega válida del reto", "100"],
              ]}
            />
          </div>
          <div className={styles.rulesPanel}>
            <TablaReglas
              titulo="Bonus de clasificación"
              columnas={["Posición", "Bonus"]}
              filas={[
                ["1.º equipo válido", "100"],
                ["2.º equipo válido", "75"],
                ["3.º equipo válido", "50"],
              ]}
            />
          </div>
        </div>
        <div className={styles.validDelivery}>
          <h3>Entrega válida</h3>
          <p>
            Cumple todos los requisitos · Funciona correctamente · Es reproducible ·
            Supera los criterios definidos por la comunidad. La velocidad solo
            cuenta cuando la solución es correcta.
          </p>
          <p>El bonus se ordena por la fecha de la versión finalmente aprobada. Reentregar cambia esa fecha. Los empates los resuelve el staff dejando constancia del motivo.</p>
        </div>
      </section>

      <section id="inscripcion" aria-labelledby="inscripcion-titulo">
        <div className={inscripcionStyles.questHeader}>
          <p className={inscripcionStyles.eyebrow}>Tu aventura empieza aquí</p>
          <h2 id="inscripcion-titulo">Misiones de inscripción</h2>
          <p>Prepara tu inventario, reúne a tu equipo y desbloquea el camino a la League.</p>
        </div>
        <ol className={inscripcionStyles.steps}>
          <li className={inscripcionStyles.quest}>
            <div className={inscripcionStyles.questBanner}>
              <span className={inscripcionStyles.questIcon} aria-hidden="true">!</span>
              <p>Misión 01 · El pase de los cinco mundos</p>
            </div>
            <h3>Consigue tus pases en Luma</h3>
            <p className={inscripcionStyles.objective}><strong>Objetivo:</strong> regístrate en los cinco eventos.</p>
            <p>Imprescindible para acceder a los eventos y validar tu participación en ellos.</p>
            <ul className={inscripcionStyles.events}>
              {eventosInscripcion.map((evento) => (
                <li key={evento.clave}>
                  <a className="button-link" href={evento.url} target="_blank" rel="noopener noreferrer">
                    {evento.nombre}<span className="sr-only"> (abre en otra pestaña)</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className={inscripcionStyles.reward}><strong>Al completarla:</strong> tendrás tus inscripciones para viajar por los cinco mundos.</p>
          </li>
          <li className={inscripcionStyles.quest}>
            <div className={inscripcionStyles.questBanner}>
              <span className={inscripcionStyles.questIcon} aria-hidden="true">⚑</span>
              <p>Misión 02 · Reúne a tu equipo</p>
            </div>
            <h3>Forma tu grupo de aventureros</h3>
            <p className={inscripcionStyles.objective}><strong>Objetivo:</strong> elegid nombre y capitán, y registrad el equipo.</p>
            <p>
              Cuando tu equipo esté formado, elegid un nombre y un capitán.
              El capitán deberá registrar al equipo en la plataforma.
            </p>
            {process.env.REGISTRATION_ENABLED === "true" ? (
              <Link className="button-link" href="/acceso">Registrarme y crear equipo</Link>
            ) : (
              <><button type="button" disabled aria-describedby="inscripcion-proximamente">Registrar equipo</button>
              <p id="inscripcion-proximamente">Próximamente</p></>
            )}
            <p>El capitán crea el equipo e invita por correo. Cada integrante se registra y acepta personalmente sus condiciones.</p>
            <p>El responsable y las personas de staff, incluidas las solicitudes pendientes, no participan en equipos.</p>
            <p className={inscripcionStyles.reward}><strong>Al completarla:</strong> vuestro equipo estará listo para solicitar la validación del staff.</p>
          </li>
          <li className={inscripcionStyles.quest}>
            <div className={inscripcionStyles.questBanner}>
              <span className={inscripcionStyles.questIcon} aria-hidden="true">✦</span>
              <p>Misión 03 · El sello del gremio</p>
            </div>
            <h3>Consigue la aprobación del staff</h3>
            <p className={inscripcionStyles.objective}><strong>Objetivo:</strong> esperar a que el staff revise vuestras inscripciones.</p>
            <p>La validación será manual. Tened paciencia y, una vez validadas, ¡a disfrutar!</p>
            <p className={inscripcionStyles.reward}><strong>Al completarla:</strong> ¡equipo validado y aventura preparada!</p>
          </li>
        </ol>
      </section>

      <section id="reglamento" aria-label="Reglamento">
        <EstadoPublico dato={puntuacion.datosAdicionales.reglamento} titulo="Reglamento" />
      </section>
    </article>
  );
}
