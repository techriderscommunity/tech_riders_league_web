"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export function ManagementForm({ action, values = {}, children, label, onCommit, className = "management-form" }: {
  action: string; values?: Record<string, string>; children?: ReactNode; label: string;
  className?: string;
  onCommit?: (commit: { sha: string; branch: string }) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true); setMessage(""); setFailed(false);
    const data = new FormData(event.currentTarget);
    const body: Record<string, string | boolean> = { ...values };
    for (const [key, value] of data) {
      if (typeof value === "string") body[key] = ["accepted", "adult", "staff"].includes(key) ? value === "on" : value;
    }
    for (const input of event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name]')) {
      body[input.name] = input.checked;
    }
    try {
      const response = await fetch(`/api/gestion/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result: { error?: string; message?: string; redirect?: string; externalRedirect?: string; commit?: { sha: string; branch: string } } = await response.json();
      if (!response.ok) { setFailed(true); setMessage(result.error ?? "No se pudo guardar el cambio."); }
      else {
        setMessage(result.message ?? "Cambio guardado.");
        if (result.commit) {
          setMessage(`Último commit: ${result.commit.sha} · Rama: ${result.commit.branch}`);
          onCommit?.(result.commit);
        }
        if (result.externalRedirect) {
          const target = new URL(result.externalRedirect);
          if (target.origin !== "https://github.com" || target.pathname !== "/login/oauth/authorize") throw new Error("Unexpected GitHub authorization URL");
          window.location.assign(target.toString());
          return;
        }
        if (result.redirect) {
          let dialog = form.closest("dialog");
          while (dialog) {
            dialog.close();
            dialog = dialog.parentElement?.closest("dialog") ?? null;
          }
          router.push(result.redirect);
        }
        router.refresh();
      }
    } catch (error) {
      console.error("Management form failed", error);
      setFailed(true); setMessage("No se pudo conectar. Comprueba el estado antes de repetir la operación.");
    } finally { setPending(false); }
  }
  return <form onSubmit={submit} className={className}>
    {children}
    <button type="submit" disabled={pending}>{pending ? "Procesando…" : label}</button>
    {message ? <p role={failed ? "alert" : "status"}>{message}</p> : null}
  </form>;
}
