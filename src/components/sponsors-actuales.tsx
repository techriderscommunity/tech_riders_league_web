import Image from "next/image";
import { obtenerSeccion } from "../lib/contenido";
import { EstadoPublico } from "./estado-publico";
import styles from "./sponsors-actuales.module.css";

export function SponsorsActuales() {
  const { contenido } = obtenerSeccion("colaboradores");
  if (contenido.publicacion !== "autorizada") {
    return <EstadoPublico dato={contenido} titulo="Sponsors" />;
  }
  return (
    <a className={styles.sponsor} href="https://www.tajamar.es/" aria-label="Tajamar">
      <Image src="/images/tajamar-logo.svg" alt="Logo oficial de Tajamar"
        width={359} height={128} sizes="(max-width: 640px) 80vw, 359px" />
    </a>
  );
}
