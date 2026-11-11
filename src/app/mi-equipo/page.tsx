import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { dashboard, sessionUser } from "../../lib/management/service";
import { ManagementForm } from "../../components/management-form";
import { OperationsPanel } from "../../components/operations-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi equipo", robots: { index: false, follow: false } };
export default async function MiEquipoPage({ searchParams }: { searchParams: Promise<{ invitacion?: string; github?: string }> }) {
  const store = await cookies();
  const params = await searchParams;
  const user = await sessionUser(store.get(process.env.NODE_ENV === "production" ? "__Host-league-session" : "league-session")?.value);
  if (!user) redirect(params.invitacion && /^[a-f0-9]{64}$/.test(params.invitacion) ? `/acceso?invitacion=${params.invitacion}` : "/acceso");
  const data = await dashboard(user);
  if (data.retired) return <article className="page-content management-page"><h1>Temporada archivada</h1>
    <p>Se han retirado los datos de participación de esta campaña. El ranking se conserva anonimizado.</p>
    {user.staff_status === "approved" ? <Link href="/gestion">Gestión</Link> : null}
    <ManagementForm action="logout" label="Cerrar sesión" />
  </article>;
  return <article className="page-content management-page">
    <h1>Mi equipo</h1>
    {params.github === "error" ? <p role="alert">No se pudo vincular GitHub. Comprueba que sigues siendo el capitán activo, que autorizas la App de lectura solo para tu repositorio privado y vuelve a intentarlo.</p> : null}
    {params.github === "linked" ? <p role="status">GitHub vinculado. Conecta tu repositorio privado si aún no lo has asociado.</p> : null}
    <p>Has entrado como {user.first_name} {user.last_name}.</p>
    <ManagementForm action="logout" label="Cerrar sesión" />
    <details className="management-card"><summary>Mis datos</summary>
      <ManagementForm action="update-profile" label="Guardar mis datos">
        <label>Nombre<input name="firstName" maxLength={100} defaultValue={user.first_name} required /></label>
        <label>Apellidos<input name="lastName" maxLength={100} defaultValue={user.last_name} required /></label>
        <label>Correo (el mismo que en Luma)<input type="email" name="email" defaultValue={user.email} required /></label>
        <label>Contraseña actual<input type="password" name="currentPassword" autoComplete="current-password" minLength={12} maxLength={128} required /></label>
        <p>Si cambias el correo, deberás confirmarlo desde el enlace enviado a la nueva dirección. Hasta entonces se mantiene el anterior.</p>
      </ManagementForm>
    </details>
    {user.staff_status === "pending" ? <p>Tu solicitud de staff está pendiente de aprobación.</p> : null}
    {user.staff_status === "approved" ? <Link className="button-link" href="/gestion">Gestionar la League</Link> : null}
    {params.invitacion ? <section>
      <h2>Aceptar invitación</h2>
      <p>Se verificará que está dirigida a tu correo. Si acabas de registrarte, vuelve al enlace de invitación después de confirmar tu correo.</p>
      <ManagementForm action="accept" values={{ token: params.invitacion }} label="Aceptar incorporación a este equipo" />
    </section> : null}
    {!data.team ? <section>
      <h2>Crear equipo como capitán</h2>
      <p>Si te han invitado, usa el enlace de tu correo en lugar de crear otro equipo.</p>
      <ManagementForm action="create-team" label="Crear equipo">
        <label>Nombre único del equipo<input name="name" maxLength={60} required /></label>
      </ManagementForm>
    </section> : <section>
      <h2>{data.team.name}</h2>
      <p>Estado: {data.team.status} {data.team.review_reason ? `· ${data.team.review_reason}` : ""}</p>
      <h3>Plantilla original ({data.members.filter(m => m.original).length}/4)</h3>
      <ul>{data.members.filter(m => m.original).map(member => <li key={member.id}>{member.first_name} {member.last_name}{member.id === data.team.captain_id ? data.team.captain_active ? " · Capitán" : " · Capitán pendiente de activación" : ""}{!member.active ? " · Baja lógica" : ""}</li>)}</ul>
      {data.team.is_captain && ["draft", "correction"].includes(data.team.status) ? <>
        <ManagementForm action="rename-team" values={{ teamId: data.team.id }} label="Guardar nombre">
          <label>Nombre<input name="name" defaultValue={data.team.name} maxLength={60} required /></label>
        </ManagementForm>
        <ManagementForm action="invite" values={{ teamId: data.team.id }} label="Invitar integrante">
          <label>Correo del compañero (igual que en Luma)<input name="email" type="email" required /></label>
        </ManagementForm>
        <ManagementForm action="submit-team" values={{ teamId: data.team.id }} label="Enviar equipo a validación" />
      </> : null}
      {data.invitations.length ? <>
        <h3>Invitaciones</h3>
        <ul>{data.invitations.map(invitation => <li key={invitation.id}>
          {invitation.email} · {invitation.status} · Caduca {new Date(invitation.expires_at).toLocaleDateString("es")}
          {invitation.status === "pending" && ["draft", "correction"].includes(data.team.status) ? <ManagementForm action="cancel-invitation" values={{ teamId: data.team.id, invitationId: invitation.id }} label="Cancelar invitación" /> : null}
        </li>)}</ul>
        <p>Para reenviar una invitación perdida o caducada, cancélala e invita de nuevo.</p>
      </> : null}
    </section>}
    {data.team?.status === "approved" ? <OperationsPanel user={user} teamId={data.team.id} /> : null}
    {user.staff_status === "approved" && !user.is_owner ? <ManagementForm action="leave-staff" label="Solicitar mi baja de staff (sin dar de baja la comunidad)">
      <label>Motivo<textarea name="reason" maxLength={1000} required /></label>
    </ManagementForm> : null}
    {!user.is_owner ? <ManagementForm action="request-withdrawal" label="Solicitar baja de mi cuenta">
      <label>Solicitud<textarea name="reason" maxLength={1000} required /></label>
      <p>Organización la tramitará; si eres capitán se requiere primero un relevo aprobado.</p>
    </ManagementForm> : null}
    <p><a href="mailto:techriders@tajamar365.com">Contactar con organización</a></p>
  </article>;
}
