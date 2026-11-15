"use client";

import { useRef, useState, type ReactNode } from "react";

export function MenuNavegacion({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);

  return <>
    <button
      ref={boton}
      type="button"
      className="nav-toggle"
      aria-controls="navegacion-principal"
      aria-expanded={abierto}
      onClick={() => setAbierto((actual) => !actual)}
    >
      {abierto ? "Cerrar menú" : "Menú"}
    </button>
    <nav
      id="navegacion-principal"
      className="site-nav"
      aria-label="Navegación principal"
      data-open={abierto}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a") && !event.target.closest("dialog")) {
          setAbierto(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && abierto && !(event.target instanceof Element && event.target.closest("dialog[open]"))) {
          setAbierto(false);
          if (boton.current?.getClientRects().length) boton.current.focus();
        }
      }}
    >
      {children}
    </nav>
  </>;
}
