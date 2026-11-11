"use client";
import { useEffect } from "react";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("League page failed", error); }, [error]);
  return <section role="alert">
    <h1>No se pudo cargar esta página</h1>
    <p>Comprueba la configuración de gestión o contacta con organización. Tus datos no se han sustituido por resultados de prueba.</p>
    <button onClick={reset}>Reintentar</button>
  </section>;
}
