"use client";

import { useState } from "react";
import { ManagementForm } from "./management-form";

export function MissionDelivery({ teamId, eventId, previousId }: { teamId: string; eventId: string; previousId?: string }) {
  const [commit, setCommit] = useState<{ sha: string; branch: string } | null>(null);
  return <section>
    <ManagementForm action="github-preview" values={{ teamId }} label="Consultar último commit disponible" onCommit={setCommit} />
    {commit ? <ManagementForm action="deliver-mission" values={{ teamId, eventId, ...(previousId ? { previousId } : {}) }} label="Entregar misión">
      <label>Versión que se evaluará (SHA)<input name="sha" defaultValue={commit.sha} key={commit.sha} pattern="[a-f0-9]{40}" minLength={40} maxLength={40} required /></label>
      <label>Rama<input name="branch" defaultValue={commit.branch} key={commit.branch} maxLength={200} required /></label>
      <p>Entregas una versión inmutable del repositorio privado conectado. Nuevos commits no cambian esta entrega.</p>
      {previousId ? <p>Reentregar sustituye la versión definitiva y cambia la fecha para el bonus, solo si las reglas lo permiten y antes del deadline.</p> : null}
    </ManagementForm> : <p>Consulta el último commit de tu repositorio conectado para elegir la versión de esta misión.</p>}
  </section>;
}
