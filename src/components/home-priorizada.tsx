import Link from "next/link";
import Image from "next/image";
import {
  IconoPerfil,
} from "./league-illustrations";
import {
  EventoIlustracion,
  numeroIlustracionEvento,
} from "./evento-ilustracion";
import { ImagenOrganizacion } from "./imagen-organizacion";
import styles from "./home-priorizada.module.css";
import { obtenerRecorridoHome } from "../lib/home";
import { SponsorsActuales } from "./sponsors-actuales";
import { PersonajesAventura } from "./personajes-aventura";

const pasos = [
  {
    icono: "▦",
    titulo: "Apúntate y haz equipo",
    texto: "Reúne a tus compañeros de aventura y preparaos para la League.",
    color: "blue",
  },
  {
    icono: "⚑",
    titulo: "Participa en los eventos",
    texto: "Recorre los mundos y vive cada etapa con tu equipo.",
    color: "orange",
  },
  {
    icono: "✦",
    titulo: "Aprende",
    texto: "Descubre nuevas tecnologías y aprende de la comunidad.",
    color: "green",
  },
  {
    icono: "♟",
    titulo: "Conoce gente",
    texto: "Comparte ideas y conecta con otros aventureros.",
    color: "purple",
  },
  {
    icono: "↗",
    titulo: "Completa los retos",
    texto: "Pon a prueba lo aprendido y construye junto a tu equipo.",
    color: "red",
  },
  {
    icono: "★",
    titulo: "Y sobre todo, ¡disfruta!",
    texto: "Celebra los descubrimientos, las anécdotas y el viaje.",
    color: "teal",
  },
] as const;

const perfiles = [
  {
    titulo: "Estoy empezando",
    icono: "brote",
    texto: "Descubre disciplinas y empieza tu camino tecnológico.",
    color: "audienceBlue",
  },
  {
    titulo: "Ya estoy construyendo",
    icono: "herramientas",
    texto: "Quiero entender qué ocurre más allá del código.",
    color: "audiencePink",
  },
  {
    titulo: "Quiero descubrir nuevas áreas",
    icono: "brujula",
    texto: "Datos, Cloud y ciberseguridad, aprendiendo junto a más personas.",
    color: "audienceGreen",
  },
  {
    titulo: "No importa cuánto sabes al llegar.",
    icono: "libro",
    texto: "Importa cuánto puedes aprender durante el camino.",
    color: "audienceNeutral",
  },
] as const;

const comunidades = [
  {
    nombre: "Guarandinga",
    canal: "https://www.youtube.com/@GuarandingaTECH",
    etapa: "negocio-arquitectura",
  },
  { nombre: "Comunidad pendiente", estado: "Por confirmar" },
  { nombre: "Comunidad pendiente", estado: "Por confirmar" },
  { nombre: "Comunidad pendiente", estado: "Por confirmar" },
] as const;

export function HomePriorizada() {
  const recorrido = obtenerRecorridoHome();

  return (
    <div className={`page-content home-page ${styles.homePage}`} id="inicio">
      <section className={styles.hero} aria-labelledby="home-titulo">
        <h1 id="home-titulo" className="sr-only">Tech Riders League. Aprende. Conecta. Construye.</h1>
        <PersonajesAventura />
      </section>

      <section
        className={styles.journey}
        id="mapa-aventura"
        aria-labelledby="mapa-titulo"
      >
        <header className={styles.journeyHeading}>
          <div>
            <h2 id="mapa-titulo">El mapa de la aventura</h2>
            <p>Cinco mundos. Una misma solución.</p>
          </div>
          <p>
            Cada etapa te ayuda a descubrir una parte del proceso.
            <br />
            Juntas, forman el camino hacia el hackathon final.
          </p>
        </header>
        <ol className={styles.stageMap}>
          {recorrido.map(({ numero, etapa }) => {
            const numeroIlustracion =
              (etapa === undefined
                ? numero === recorrido.length
                  ? 5
                  : undefined
                : numeroIlustracionEvento(etapa.slug));
            if (numeroIlustracion === undefined) {
              throw new RangeError(`No hay ilustración para la etapa ${numero}.`);
            }
            const titulo =
              etapa?.nombre.publicacion === "autorizada"
                ? etapa.nombre.valor
                : numero === recorrido.length
                  ? "Hackathon final"
                  : "Etapa pendiente";
            const disponible = etapa !== undefined;
            const eventKey =
              etapa?.slug ?? (numero === recorrido.length ? "hackathon" : `etapa-${numero}`);
            const href = `/eventos?etapa=${eventKey}`;

            return (
              <li
                className={styles.stage}
                id={numero === recorrido.length ? "hackathon-final" : undefined}
                key={numero}
              >
                <EventoIlustracion
                  numero={numeroIlustracion}
                  clase={styles.stageArtwork}
                  prioridad={numero === 1}
                />
                <article className={styles.stageCard}>
                  <span className={styles.stageNumber}>
                    {numero === recorrido.length ? "Mundo final" : `Mundo ${numero}`}
                  </span>
                  <h3>{titulo}</h3>
                  <p>
                    {numero === recorrido.length
                      ? "Conecta todo lo aprendido y constrúyelo en equipo."
                      : disponible
                        ? "Descubre una nueva disciplina y aprende junto a la comunidad."
                        : "El nombre y los detalles se publicarán cuando estén confirmados."}
                  </p>
                  <Link
                    className={`${styles.stageBadge} ${disponible || numero === recorrido.length ? styles.stageReady : ""}`}
                    href={href}
                  >
                    {numero === recorrido.length ? "Ver hackathon" : "Ver en el mapa"}
                  </Link>
                </article>
              </li>
            );
          })}
        </ol>
      </section>

      <div className={styles.participationPanel}>
        <section
          className={styles.forYou}
          id="para-ti"
          aria-labelledby="para-ti-titulo"
        >
          <div className={styles.forYouIntro}>
            <h2 className={styles.sectionTitle} id="para-ti-titulo">
              <span aria-hidden="true">✦</span> ¿Es para ti? <span aria-hidden="true">✦</span>
            </h2>
            <h3>No necesitas ser experto para empezar.</h3>
            <p>
              Si estás estudiando o empezando tu carrera, aquí entenderás cómo
              conectar tecnología y comunidad, paso a paso.
            </p>
          </div>
          <div className={styles.audienceCards}>
            {perfiles.map((perfil) => (
              <article
                className={`${styles.audienceCard} ${styles[perfil.color]}`}
                key={perfil.titulo}
              >
                <div className={styles.profileIcon}>
                  <IconoPerfil tipo={perfil.icono} />
                </div>
                <h3>{perfil.titulo}</h3>
                <p>{perfil.texto}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.howTo} aria-labelledby="participacion-titulo">
          <h2 className={styles.sectionTitle} id="participacion-titulo">
            <span aria-hidden="true">✦</span> ¿Cómo participar? <span aria-hidden="true">✦</span>
          </h2>
          <p className={styles.howToIntro}>
            Tu aventura empieza en equipo. Aprende, comparte y disfruta del camino.
            <Link href="/participacion"> Ver cómo participar</Link>
          </p>
          <ol className={styles.steps}>
            {pasos.map((paso, index) => (
              <li className={styles.step} key={paso.titulo}>
                <span className={`${styles.stepNumber} ${styles[paso.color]}`}>
                  {index + 1}
                </span>
                <span className={styles.stepIcon} aria-hidden="true">
                  {paso.icono}
                </span>
                <h3>{paso.titulo}</h3>
                <p>{paso.texto}</p>
                {index < pasos.length - 1 ? (
                  <span className={styles.stepArrow} aria-hidden="true">➜</span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section
        className={styles.community}
        id="comunidades"
        aria-labelledby="comunidades-titulo"
      >
        <h2 className={styles.sectionTitle} id="comunidades-titulo">
          <span aria-hidden="true">✦</span> Una League construida entre comunidades{" "}
          <span aria-hidden="true">✦</span>
        </h2>
        <div className={styles.communityRow}>
          {comunidades.map((comunidad, index) => (
            <Link
              className={styles.communityCard}
              href={"canal" in comunidad ? comunidad.canal : "/comunidades"}
              key={`${comunidad.nombre}-${index}`}
              aria-label={comunidad.nombre}
            >
              {"etapa" in comunidad ? (
                <Image
                  src="/images/guarandinga-logo.jpg"
                  alt="Logo oficial de Guarandinga Tech"
                  className={styles.communityLogo}
                  width={900}
                  height={900}
                  sizes="(max-width: 704px) 40vw, 22vw"
                />
              ) : (
                <div className={styles.communityPlaceholder} aria-hidden="true">Logo pendiente</div>
              )}
              <strong>{comunidad.nombre}</strong>
              {"estado" in comunidad ? <span>{comunidad.estado}</span> : null}
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.recording} aria-labelledby="grabacion-titulo">
        <a href="https://sirviendocodigo.com/" aria-label="SirviendoCódigo">
          <Image
            src="/images/sirviendo-codigo-logo.png"
            alt="Logo oficial de SirviendoCódigo"
            className={styles.recordingImage}
            width={374}
            height={135}
            sizes="(max-width: 704px) 90vw, 35vw"
          />
        </a>
        <div>
          <p className={styles.recordingEyebrow}>Grabación y memoria</p>
          <h2 id="grabacion-titulo">Toda aventura necesita pruebas</h2>
          <p>
            Decisiones de arquitectura, líneas de código, bugs legendarios y
            algún <strong>«en mi local funciona»</strong> acabarán formando parte
            de la historia.
          </p>
          <p>
            <strong>
              SirviendoCódigo grabará las sesiones y otros contenidos de la League
            </strong>{" "}
            para que cada mundo deje su huella.
          </p>
          <p>
            Lo bueno quedará documentado. <strong>Lo demás también.</strong>
          </p>
        </div>
      </section>

      <section className={styles.partners} aria-labelledby="partners-titulo">
        <div className={styles.partnersHeading}>
          <div>
            <h2 id="partners-titulo">
              <span aria-hidden="true">✦</span> Con el apoyo de
            </h2>
            <p>Organizaciones que creen en el talento, el aprendizaje y la comunidad.</p>
          </div>
        </div>
        <SponsorsActuales />
        <div className={styles.partnerCta}>
          <p>¿Quieres apoyar la aventura?</p>
          <Link className={styles.eventButton} href="/colaboradores">
            Quiero colaborar <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

    </div>
  );
}
