"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./personajes-aventura.module.css";

const personajes = [
  {
    nombre: "Techito",
    imagen: "/images/Techito.png",
    rol: "Explorador de la League",
    habilidades: ["Explorar nuevas rutas", "Proponer alternativas", "Conectar ideas"],
  },
  {
    nombre: "Codechito",
    imagen: "/images/SirviendoCodigo.png",
    rol: "Cronista de la aventura",
    habilidades: ["Grabar las sesiones", "Documentar los descubrimientos", "Guardar las Crónicas"],
  },
  {
    nombre: "Guarandinchito",
    imagen: "/images/GuarandingaTech.png",
    rol: "Guardián del Reino de las Decisiones",
    habilidades: ["Descubrir necesidades", "Poner a prueba decisiones", "Defender la arquitectura"],
  },
  ...[4, 5, 6].map((plaza) => ({
    nombre: `Personaje ${plaza}`,
    imagen: null,
    rol: "Todavía por descubrir",
    habilidades: [],
  })),
];

export function PersonajesAventura() {
  const [abierto, setAbierto] = useState<number | null>(null);
  const grupo = useRef<HTMLDivElement>(null);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  useLayoutEffect(() => {
    if (abierto === null) return;
    const boton = botones.current[abierto];
    const panel = document.getElementById(`personaje-${abierto}`);
    if (!boton || !panel) return;
    panel.showPopover();
    function colocar() {
      if (!boton || !panel) return;
      const ancla = boton.getBoundingClientRect();
      const ficha = panel.getBoundingClientRect();
      const viewport = window.visualViewport;
      const izquierda = (viewport?.offsetLeft ?? 0) + 8;
      const arriba = (viewport?.offsetTop ?? 0) + 8;
      const derecha = izquierda + (viewport?.width ?? window.innerWidth) - 16;
      const abajo = arriba + (viewport?.height ?? window.innerHeight) - 16;
      const preferido = ancla.top - ficha.height >= arriba
        ? ancla.top - ficha.height
        : ancla.bottom;
      panel.style.left = `${Math.max(izquierda, Math.min(ancla.left + ancla.width / 2 - ficha.width / 2, derecha - ficha.width))}px`;
      panel.style.top = `${Math.max(arriba, Math.min(preferido, abajo - ficha.height))}px`;
    }
    colocar();
    const observer = new ResizeObserver(colocar);
    observer.observe(panel);
    window.addEventListener("resize", colocar);
    window.addEventListener("scroll", colocar, true);
    window.visualViewport?.addEventListener("resize", colocar);
    window.visualViewport?.addEventListener("scroll", colocar);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", colocar);
      window.removeEventListener("scroll", colocar, true);
      window.visualViewport?.removeEventListener("resize", colocar);
      window.visualViewport?.removeEventListener("scroll", colocar);
      panel.hidePopover();
    };
  }, [abierto]);

  useEffect(() => {
    if (abierto === null) return;
    const indiceAbierto = abierto;
    function cerrarFuera(event: PointerEvent) {
      if (event.target instanceof Node && !grupo.current?.contains(event.target)) {
        setAbierto(null);
      }
    }
    function cerrarEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (grupo.current?.contains(document.activeElement)) {
          botones.current[indiceAbierto]?.focus();
        }
        setAbierto(null);
      }
    }
    document.addEventListener("pointerdown", cerrarFuera);
    document.addEventListener("keydown", cerrarEscape);
    return () => {
      document.removeEventListener("pointerdown", cerrarFuera);
      document.removeEventListener("keydown", cerrarEscape);
    };
  }, [abierto]);

  return (
    <div className={styles.escena} ref={grupo}>
      <Image
        className={styles.banner}
        src="/images/banner-home.png"
        alt="Tech Riders League: una aventura tecnológica para quienes están empezando. Del problema a la solución, paso a paso. Codechito, Techito y Guarandinchito acompañan a los aventureros en una isla pixel art."
        width={1152}
        height={676}
        sizes="(max-width: 1600px) 100vw, 1600px"
        priority
      />
      <a className={styles.comenzar} href="/participacion" aria-label="Comenzar la aventura" />
      <ul className={styles.grupo} aria-label="Personajes de la aventura">
      {personajes.map((personaje, indice) => (
        <li
          key={personaje.nombre}
          className={styles.plaza}
          data-personaje={indice}
          onMouseEnter={() => setAbierto(indice)}
          onMouseLeave={(event) => {
            if (!event.currentTarget.contains(document.activeElement)) setAbierto(null);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setAbierto(null);
          }}
        >
          <button
            ref={(elemento) => { botones.current[indice] = elemento; }}
            type="button"
            className={styles.avatar}
            aria-label={`${personaje.nombre}: ver ficha`}
            aria-expanded={abierto === indice}
            aria-controls={`personaje-${indice}`}
            onFocus={() => setAbierto(indice)}
            onClick={() => setAbierto(indice)}
          >
            <span className={styles.nombre}>{personaje.imagen ? personaje.nombre : "Por descubrir"}</span>
          </button>
          <div
            id={`personaje-${indice}`}
            className={styles.desplegable}
            popover="manual"
            hidden={abierto !== indice}
          >
            <section className={styles.ficha} aria-label={`Ficha de ${personaje.nombre}`}>
              <div className={styles.encabezado}>
                <div>
                  <h2>{personaje.imagen ? personaje.nombre : "Por descubrir"}</h2>
                  <p>{personaje.rol}</p>
                </div>
                <button type="button" className={styles.cerrar} aria-label="Cerrar ficha"
                  onClick={() => {
                    botones.current[indice]?.focus();
                    setAbierto(null);
                  }}>X</button>
              </div>
              {personaje.imagen ? (
                <Image className={styles.retrato} src={personaje.imagen} alt={personaje.nombre}
                  width={360} height={220} sizes="280px" />
              ) : (
                <div className={styles.silueta} aria-hidden="true">?</div>
              )}
              <h3>Habilidades</h3>
              {personaje.habilidades.length ? (
                <ul>{personaje.habilidades.map((habilidad) => <li key={habilidad}>{habilidad}</li>)}</ul>
              ) : (
                <p>Se revelarán con este personaje.</p>
              )}
            </section>
          </div>
        </li>
      ))}
      </ul>
    </div>
  );
}
