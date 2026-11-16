"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function TeamLogoForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(`/api/equipos/${encodeURIComponent(teamId)}/logo`, {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const result: { error?: string; message?: string } = await response.json();
      if (!response.ok) {
        setFailed(true);
        setMessage(result.error ?? "No se pudo guardar el logo.");
      } else {
        setMessage(result.message ?? "Logo guardado.");
        router.refresh();
      }
    } catch (error) {
      console.error("Team logo form failed", error);
      setFailed(true);
      setMessage("No se pudo conectar. Comprueba el estado antes de repetir la operación.");
    } finally {
      setPending(false);
    }
  }
  return <form onSubmit={submit} encType="multipart/form-data" className="management-form">
    <label>Logo del equipo<input name="file" type="file" accept="image/png,image/jpeg,image/webp" required /></label>
    <button type="submit" disabled={pending}>{pending ? "Procesando…" : "Actualizar logo"}</button>
    {message ? <p role={failed ? "alert" : "status"}>{message}</p> : null}
  </form>;
}
