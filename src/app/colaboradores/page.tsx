import type { Metadata } from "next";
import { SponsorsActuales } from "../../components/sponsors-actuales";
import { metadataPagina } from "../../lib/metadata";
import styles from "./colaboradores.module.css";

export const metadata: Metadata = metadataPagina(
  "Colabora",
  "Haz posible la aventura: descubre cómo colaborar con la Tech Riders League como sponsor global, de evento o del hackathon.",
  "/colaboradores",
);

export default function ColaboradoresPage() {
  return (
    <article className="page-content">
      <header className={styles.introduction}>
        <p className="eyebrow">Tech Riders League 2027</p>
        <h1>Haz posible la aventura</h1>
        <p className={styles.opening}>Toda gran expedición necesita aliados.</p>
        <p>
          Entre enero y mayo de 2027, la <strong>Tech Riders League recorrerá cinco mundos</strong>,
          con jornadas de entre <strong>100 y 150 asistentes esperados</strong> y
          espacio para crecer hasta las <strong>400 personas</strong>. Cada etapa
          estará liderada por una comunidad especializada que traerá consigo
          conocimiento, retos y su propio público técnico.
        </p>
        <p>
          Las organizaciones que se sumen no estarán simplemente poniendo su logo
          en un cartel. <strong>Formarán parte de la historia.</strong>
        </p>
      </header>

      <section id="ser-sponsor" aria-labelledby="ser-sponsor-titulo">
        <h2 id="ser-sponsor-titulo">Tres formas de entrar en la League</h2>
        <div className={styles.modalities}>
          <section className={styles.modality} aria-labelledby="sponsor-global">
            <span className={styles.symbol} aria-hidden="true">⭐</span>
            <h3 id="sponsor-global">Sponsor Global</h3>
            <p>Acompaña la aventura durante toda la temporada y tendrá presencia en los cinco mundos.</p>
          </section>
          <section className={styles.modality} aria-labelledby="sponsor-evento">
            <span className={styles.symbol} aria-hidden="true">🗺️</span>
            <h3 id="sponsor-evento">Sponsor de Evento</h3>
            <p>Elige un mundo y conecta directamente con la comunidad y el talento relacionado con esa especialidad.</p>
          </section>
          <section className={styles.modality} aria-labelledby="sponsor-hackathon">
            <span className={styles.symbol} aria-hidden="true">🏆</span>
            <h3 id="sponsor-hackathon">Sponsor Hackathon</h3>
            <p>Forma parte del gran desafío final, donde todo lo aprendido durante la League se convertirá en soluciones.</p>
          </section>
        </div>
        <p className={styles.stand}>
          Todas las modalidades incluirán <strong>stand propio</strong>, el punto
          de encuentro directo con los participantes: conocer perfiles, conversar
          sobre oportunidades, recoger CVs y abrir la puerta a prácticas o contrataciones.
        </p>
      </section>

      <section className={styles.contribution} aria-labelledby="destino-aportaciones-titulo">
        <h2 id="destino-aportaciones-titulo">A qué se destinarán las aportaciones</h2>
        <p>
          Las aportaciones se destinarán a <strong>desayunos, camisetas,
          merchandising, licencias, premios y otros recursos</strong> que hagan
          posible la aventura y mejoren la experiencia de los participantes.
        </p>
      </section>

      <section className={styles.commitment} aria-labelledby="compromiso-titulo">
        <h2 id="compromiso-titulo">Un compromiso desde el principio</h2>
        <p>
          Queremos construir esta League con la misma filosofía con la que
          construimos comunidad: <strong>con transparencia</strong>.
        </p>
        <p>
          Las aportaciones tendrán un propósito claro y estarán destinadas a hacer
          posible una experiencia mejor para quienes participen.
        </p>
      </section>

      <section aria-labelledby="sponsors-actuales">
        <h2 id="sponsors-actuales">Sponsors que colaboran actualmente</h2>
        <SponsorsActuales />
      </section>

      <div className="sponsor-cta">
        <p>Cinco mundos. Cientos de personas. Una aventura que no podremos construir solos.</p>
        <a className="button-link" href="mailto:techriders@tajamar365.com">
          Quiero colaborar <span aria-hidden="true">→</span>
        </a>
      </div>

    </article>
  );
}
