import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionUser, staffDashboard } from "../../lib/management/service";
import { ManagementForm } from "../../components/management-form";
import Link from "next/link";
import { OperationsPanel } from "../../components/operations-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gestión", robots: { index: false, follow: false } };
export default async function GestionPage({ searchParams }: { searchParams: Promise<{ equipo?: string }> }) {
  const store = await cookies();
  const user = await sessionUser(store.get(process.env.NODE_ENV === "production" ? "__Host-league-session" : "league-session")?.value);
  if (!user) redirect("/acceso");
  if (user.staff_status !== "approved") return <article className="page-content"><h1>Acceso pendiente</h1><p>Necesitas aprobación de staff para gestionar la League.</p><Link href="/mi-equipo">Volver</Link></article>;
  const data = await staffDashboard(user);
  const params = await searchParams;
  return <article className="page-content management-page">
    <h1>Gestión de la League</h1>
    <p>Bienvenido, {user.first_name}. Elige una sección para desplegar sus herramientas.</p>
    <Link href="/mi-equipo">Mi cuenta</Link>
    <details className="management-section"><summary>Solicitudes de staff <span>{data.staff.filter(person => person.staff_status === "pending").length} pendientes</span></summary>
      {!data.staff.length ? <p>No hay solicitudes pendientes.</p> : data.staff.map(person => <section key={person.id} className="management-card">
        <h3>{person.first_name} {person.last_name}</h3><p>{person.email} · {person.community} · {person.staff_status}</p>
        {person.staff_status === "pending" ? <ManagementForm action="review" values={{ id: person.id, kind: "staff", status: "approved" }} label="Aprobar staff" /> : null}
        {user.is_owner ? <ManagementForm action="review" values={{ id: person.id, kind: "staff", status: "removed" }} label="Dar de baja del staff" /> : null}
      </section>)}
    </details>
    <details className="management-section"><summary>Equipos pendientes de validación <span>{data.teams.length} pendientes</span></summary>
      {!data.teams.length ? <p>No hay equipos pendientes.</p> : data.teams.map(team => <section key={team.id} className="management-card">
        <h3>{team.name}</h3><p>Capitán: {team.captain_email}</p>
        <ul>{team.members.map(member => <li key={member.id}>{member.first_name} {member.last_name} · {member.email}</li>)}</ul>
        <ManagementForm action="review" values={{ id: team.id, kind: "team", status: "approved" }} label="Aprobar equipo" />
        <ManagementForm action="review" values={{ id: team.id, kind: "team", status: "correction" }} label="Pedir corrección">
          <label>Motivo<textarea name="reason" maxLength={1000} required /></label>
        </ManagementForm>
        <ManagementForm action="review" values={{ id: team.id, kind: "team", status: "rejected" }} label="Rechazar">
          <label>Motivo<textarea name="reason" maxLength={1000} required /></label>
        </ManagementForm>
      </section>)}
    </details>
    <OperationsPanel user={user} search={params.equipo ?? ""} />
    <details className="management-section"><summary>Correo pendiente y fallido <span>{data.mails.length} mensajes</span></summary>
      <p>Los correos se guardan antes del envío. Necesitas SMTP autorizado; nunca se consideran entregados solo por crear la invitación.</p>
      <ManagementForm action="send-mail" label="Procesar correo pendiente" />
      <ul>{data.mails.map(mail => <li key={mail.id}>{mail.recipient} · {mail.subject} · {mail.status}
        {mail.last_error ? <p role="alert">{mail.last_error}</p> : null}
        {mail.status === "failed" ? <ManagementForm action="retry-mail" values={{ id: mail.id }} label="Volver a poner en cola" /> : null}
      </li>)}</ul>
    </details>
  </article>;
}
