import { obtenerSeccion } from "../lib/contenido";
import { EstadoPublico } from "./estado-publico";
import Image from "next/image";
import styles from "./equipos-temporada.module.css";

export function EquiposTemporada() {
  const { contenido } = obtenerSeccion("equipos");
  if (contenido.publicacion !== "autorizada") {
    return <EstadoPublico dato={contenido} titulo="Cómo funcionan los equipos" />;
  }
  if (!Array.isArray(contenido.valor) || !contenido.valor.every((regla) => typeof regla === "string")) {
    throw new TypeError("Las reglas de equipos deben ser una lista de textos.");
  }

  return (
    <section className={styles.equipos} aria-labelledby="equipos-temporada-titulo">
      <h2 id="equipos-temporada-titulo">Equipos estables durante toda la temporada</h2>
      <div className={styles.contenido}>
        <Image
          className={styles.ilustracion}
          src="/images/equipos-temporada.png"
          alt="Equipos de aventureros pixel art colaborando con sus portátiles."
          width={446}
          height={380}
          sizes="(max-width: 446px) 100vw, 446px"
        />
        <div className={styles.detalles}>
          <p className={styles.integrantes}><strong>4</strong><span>integrantes<br />por equipo</span></p>
          <div className={styles.reglas}>
            <span className={styles.pixeles} aria-hidden="true" />
            <h3>Equipo Oficial de la temporada</h3>
            <ul>{contenido.valor.map((regla) => <li key={regla}>{regla}</li>)}</ul>
          </div>
          <p className={styles.nota}>Esta regla es fundamental para fomentar la continuidad.</p>
        </div>
      </div>
    </section>
  );
}
