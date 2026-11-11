import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Navegacion } from "../components/navegacion";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Tech Riders League 2027",
    template: "%s | Tech Riders League",
  },
  description:
    "Sigue la temporada tecnológica Tech Riders League 2027, sus etapas y la información pública confirmada.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        <Navegacion />
        <main id="contenido">{children}</main>
        <footer className="site-footer">
          <div className="footer-inner">
            <Link className="footer-brand" href="/">
              <strong>Tech Riders League 2027</strong>
              <span>Aprender hoy. Construir mañana. Juntos.</span>
            </Link>
            <nav className="footer-group" aria-label="Explora">
              <h2>Explora</h2>
              <Link href="/eventos">Mapa de la aventura</Link>
            </nav>
            <nav className="footer-group" aria-label="Participa">
              <h2>Participa</h2>
              <Link href="/participacion">Cómo participar</Link>
              <Link href="/acceso">Acceder / Mi equipo</Link>
            </nav>
            <nav className="footer-group" aria-label="Resultados">
              <h2>Resultados</h2>
              <Link href="/clasificacion">Clasificación y premios</Link>
              <Link href="/memoria">Recursos y memoria</Link>
            </nav>
            <nav className="footer-group" aria-label="Colabora">
              <h2>Colabora</h2>
              <Link href="/colaboradores">Ser sponsor</Link>
            </nav>
          </div>
          <div className="footer-legal">
            <span>Tech Riders League 2027 · Información pública de temporada.</span>
            <Link href="/privacidad">Condiciones y privacidad</Link>
            <Link href="/codigo-de-conducta">Código de Conducta</Link>
            <div className="footer-location">
              <address>Tajamar · Calle Pío Felipe, 12 · 28038 Madrid</address>
              <a href="https://www.google.com/maps/dir/?api=1&destination=Tajamar%2C%20Calle%20P%C3%ADo%20Felipe%2012%2C%2028038%20Madrid"
                target="_blank" rel="noopener noreferrer">
                Cómo llegar<span className="sr-only"> (abre Google Maps en otra pestaña)</span>
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
