"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./mapa-aventura.module.css";

type MundoMapa = {
  clave: string;
  titulo: string;
  etiqueta: string;
  inscripcion: string;
  detalle: ReactNode;
};

export function MapaAventura({
  mundos,
  seleccion,
}: {
  mundos: MundoMapa[];
  seleccion?: string;
}) {
  const router = useRouter();
  const modal = useRef<HTMLDialogElement>(null);
  const mundoAbierto = mundos.find((mundo) => mundo.clave === seleccion);

  useEffect(() => {
    const dialog = modal.current;
    if (!dialog) return;
    if (seleccion === undefined) {
      dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflowAnterior;
    };
  }, [seleccion]);

  function cerrarDetalle() {
    modal.current?.close();
    router.replace("/eventos", { scroll: false });
  }

  return (
    <>
      <section className={styles.map} aria-label="Los cinco mundos">
        <h1 className={styles.srOnly}>Mapa de la aventura</h1>
        <div className={styles.introduction}>
          <p>Existe un lugar donde las aventuras tecnológicas cobran vida.</p>
          <p>
            Un lugar donde los futuros desarrolladores, arquitectos, exploradores
            de la IA y maestros de los sistemas se reúnen para afrontar desafíos,
            descubrir nuevas habilidades y construir cosas increíbles.
          </p>
          <p>Ese lugar es <strong>Tajamar</strong>.</p>
        </div>
        <p className={styles.instructions} id="instrucciones-mapa">
          Elige tu destino. Haz clic en una isla para descubrir su historia.
        </p>
        <p className={styles.mobileHint}>Desliza el mapa para explorar los cinco mundos.</p>
        <div className={styles.viewport} role="region" aria-label="Mapa ilustrado interactivo" aria-describedby="instrucciones-mapa" tabIndex={0}>
          <div className={styles.scene}>
            <Image
              src="/images/Mapa%20League.png"
              alt="Cinco islas conectadas en un mundo pixel art: el reino de Negocio y Arquitectura, la ciudad de Datos, las islas de Cloud, la fortaleza de Seguridad y el coliseo del hackathon final."
              width={1536}
              height={1024}
              sizes="(max-width: 960px) 960px, (max-width: 1600px) 100vw, 1600px"
              className={styles.artwork}
              priority
            />
            <ol className={styles.worlds}>
              {mundos.map((mundo) => (
                <li key={mundo.clave} data-mundo={mundo.clave} className={styles.world}>
                  <Link
                    className={styles.hotspot}
                    href={`/eventos?etapa=${mundo.clave}`}
                    scroll={false}
                    aria-label={`${mundo.etiqueta} · ${mundo.titulo}. Abrir detalles`}
                    aria-haspopup="dialog"
                    aria-controls="mundo-dialog"
                    aria-current={seleccion === mundo.clave ? "step" : undefined}
                  >
                    <span className={styles.tooltip}>
                      {mundo.etiqueta} · {mundo.titulo}
                      <strong>Haz clic para explorar →</strong>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
      <dialog
        ref={modal}
        id="mundo-dialog"
        className="world-dialog"
        aria-labelledby="detalle-titulo"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            cerrarDetalle();
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          cerrarDetalle();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom
            ) {
              cerrarDetalle();
            }
          }
        }}
      >
        <div className="world-dialog-toolbar">
          {mundoAbierto ? (
            <a className="button-link" href={mundoAbierto.inscripcion} target="_blank" rel="noopener noreferrer">
              Inscríbete <span className={styles.srOnly}>en {mundoAbierto.etiqueta} en Luma (abre en otra pestaña)</span>
            </a>
          ) : null}
          <button type="button" onClick={cerrarDetalle} autoFocus>
            Cerrar <span aria-hidden="true">×</span>
          </button>
        </div>
        {mundoAbierto?.detalle}
      </dialog>
    </>
  );
}
