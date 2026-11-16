import Link from "next/link";
import { notFound } from "next/navigation";
import { IntranetShell } from "./intranet-shell";
import { ManagementForm } from "./management-form";
import { OperationsPanel } from "./operations-panel";
import styles from "./intranet-shell.module.css";
import { operationsDashboard } from "../lib/management/operations";
import { hasControlCenterAccess, staffDashboard, type User } from "../lib/management/service";
import { OFFICIAL_REPOSITORY } from "../lib/management/github-api";

export type ManagementScreen =
  | "control" | "worlds" | "challenges" | "deliveries" | "evaluations"
  | "teams" | "participants" | "points" | "staff" | "staff-directory" | "community";

const screens: Record<ManagementScreen, { title: string; description: string }> = {
  control: { title: "Centro de control", description: "Resumen de la actividad y acceso directo a cada área de gestión." },
  worlds: { title: "Mi mundo (Datos)", description: "Consulta los equipos, la asistencia y el progreso de los mundos que tienes asignados." },
  challenges: { title: "Retos en GitHub", description: "Consulta y publica los retos en el repositorio público de la League." },
  deliveries: { title: "Entregas", description: "Revisa evidencias y entregas recibidas por los equipos." },
  evaluations: { title: "Evaluaciones", description: "Gestiona rúbricas y evaluaciones de entregas." },
  teams: { title: "Equipos", description: "Consulta plantillas y resuelve las validaciones pendientes." },
  participants: { title: "Participantes", description: "Consulta las personas inscritas y su actividad dentro de tu ámbito." },
  points: { title: "Rankings y puntos", description: "Revisa el ledger de puntos y publica resultados verificados." },
  staff: { title: "Solicitudes Staff", description: "Gestiona las solicitudes y los ámbitos de acceso del equipo Staff." },
  "staff-directory": { title: "Staff de la League", description: "Consulta el equipo Staff activo y las comunidades a las que pertenece." },
  community: { title: "Comunidad", description: "Administra comunidades, ámbitos y solicitudes de baja." },
};

const worldArt = [
  "/images/Tech%20Riders%20League%20I.png",
  "/images/Tech%20Riders%20League%20II.png",
  "/images/Tech%20Riders%20League%20III.png",
  "/images/Tech%20Riders%20League%20IV.png",
  "/images/Tech%20Riders%20League%20Final.png",
] as const;

function ControlDashboard({
  staffData,
  operations,
  isAdmin,
}: {
  staffData: Awaited<ReturnType<typeof staffDashboard>>;
  operations: Awaited<ReturnType<typeof operationsDashboard>>;
  isAdmin: boolean;
}) {
  const people = new Set(operations.views.flatMap(view =>
    view.originals.filter(person => person.active).map(person => person.id)));
  const captains = new Set(operations.views
    .map(view => view.originals.find(person => person.id === view.team.captain_id && person.active)?.id)
    .filter((id): id is string => Boolean(id)));
  const latest = operations.submissions.filter(submission => submission.current).slice(0, 5);
  const rankings = isAdmin ? operations.global?.rows.slice(0, 5) ?? [] : [];
  const upcoming = operations.challenges
    .filter(challenge => challenge.deadline && new Date(challenge.deadline).getTime() >= Date.now())
    .sort((left, right) => new Date(left.deadline!).getTime() - new Date(right.deadline!).getTime())
    .slice(0, 4);
  const participation = operations.events.map(event => {
    const roster = operations.views.flatMap(view => view.worlds.find(world => world.event.id === event.id)?.people ?? []);
    const present = roster.filter(person => person.present).length;
    return { event, present, total: roster.length };
  });
  const distribution = [
    { label: "Participantes", value: Math.max(0, people.size - captains.size) },
    { label: "Capitanes", value: captains.size },
    ...(isAdmin ? [{ label: "Staff", value: staffData.accounts.filter(account => account.staff_status === "approved" || account.is_league_admin).length }] : []),
  ];
  const distributionTotal = distribution.reduce((sum, item) => sum + item.value, 0);

  return <section className={styles.managementDashboard}>
    <div className={styles.managementGrid}>
      <article className={styles.managementHero}>
        <div>
          <p className={styles.featureLabel}>CENTRO DE CONTROL · TEMPORADA 2027</p>
          <h2>La League, de un vistazo</h2>
          <p>{isAdmin
            ? "Solicitudes, equipos y actividad publicados en un único espacio de operación."
            : "Actividad de los mundos que tienes asignados, sin acceso a los ámbitos de otras comunidades."}</p>
        </div>
        <img src="/images/Mapa League.png" alt="" />
      </article>
      <section className={`${styles.managementPanel} ${styles.managementPanelWide}`}>
        <header className={styles.managementPanelHeader}>
          <h2>Estado de los mundos</h2>
          <Link href="/gestion/mundos">{isAdmin ? "Ver todos →" : "Ver mis mundos →"}</Link>
        </header>
        <div className={styles.managementWorldList}>
          {operations.events.map(event => {
            const submissions = operations.submissions.filter(item => item.event_id === event.id && item.current);
            const pending = submissions.filter(item => item.status === "pending").length;
            return <Link key={event.id} className={styles.managementWorldCard}
              href={`/gestion/mundos?mundo=${encodeURIComponent(event.id)}`}>
              <img src={worldArt[event.ordinal - 1] ?? worldArt[0]} alt="" />
              <strong>Mundo {event.ordinal} · {event.name}</strong>
              <span>{event.closed ? "Cerrado" : `${submissions.length} entregas · ${pending} pendientes`}</span>
            </Link>;
          })}
        </div>
      </section>
      <section className={`${styles.managementPanel} ${styles.managementPanelWide}`}>
        <header className={styles.managementPanelHeader}>
          <h2>Actividad reciente</h2>
          <Link href="/gestion/entregas">Ver entregas →</Link>
        </header>
        {!latest.length ? <p className={styles.managementEmpty}>Todavía no hay entregas registradas.</p> : <ul className={styles.managementActivity}>
          {latest.map(item => <li key={item.id}>
            <strong>{operations.views.find(view => view.team.id === item.team_id)?.team.name ?? "Equipo"} · {item.event_id}</strong>
            <span className={styles.managementPill} data-tone={item.status === "approved" ? "success" : "warning"}>{item.status}</span>
            <small>{item.commit_sha ? `SHA ${item.commit_sha.slice(0, 7)}` : item.kind === "photo" ? "Evidencia fotográfica" : "Entrega"}</small>
            <time dateTime={new Date(item.submitted_at).toISOString()}>
              {new Date(item.submitted_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}
            </time>
          </li>)}
        </ul>}
      </section>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}>
          <h2>Equipos por validar</h2>
          <Link href="/gestion/equipos">Ver cola →</Link>
        </header>
        {!staffData.teams.length ? <p className={styles.managementEmpty}>No hay equipos pendientes de validación.</p> : <ul className={styles.managementActivity}>
          {staffData.teams.slice(0, 5).map(team => <li key={team.id}>
            <strong>{team.name}</strong><span className={styles.managementPill} data-tone="warning">Pendiente</span>
            <small>{team.captain_email}</small><Link href="/gestion/equipos">Revisar</Link>
          </li>)}
        </ul>}
      </section>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}>
          <h2>Vista previa global</h2>
          <Link href="/gestion/puntos">Ver puntos →</Link>
        </header>
        {!rankings.length ? <p className={styles.managementEmpty}>Aún no hay una clasificación global publicada.</p> : <ol className={styles.managementActivity}>
          {rankings.map((row, index) => <li key={row.id}>
            <strong>{index + 1}. {row.equipo}</strong>
            <span>{row.puntos.toLocaleString("es-ES")} pts</span>
          </li>)}
        </ol>}
        <p>Los resultados se consideran oficiales solo cuando se publican desde la pantalla de puntos.</p>
      </section>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}>
          <h2>Próximos hitos</h2>
          <Link href="/gestion/evaluaciones">Calendario de entregas →</Link>
        </header>
        {!upcoming.length ? <p className={styles.managementEmpty}>No hay fechas límite futuras publicadas.</p> : <ul className={styles.managementActivity}>
          {upcoming.map(challenge => {
            const event = operations.events.find(item => item.id === challenge.event_id);
            return <li key={challenge.event_id}>
              <strong>{challenge.title}</strong>
              <span>{event?.name ?? challenge.event_id}</span>
              <time dateTime={new Date(challenge.deadline!).toISOString()}>
                {new Date(challenge.deadline!).toLocaleString("es-ES", { timeZone: challenge.timezone || "Europe/Madrid" })}
              </time>
            </li>;
          })}
        </ul>}
      </section>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>Participación por mundo</h2></header>
        {!participation.length ? <p className={styles.managementEmpty}>No hay mundos asignados.</p> : <ul className={styles.managementBars}>
          {participation.map(({ event, present, total }) => <li key={event.id}>
            <span>M{event.ordinal}</span><span className={styles.managementBarTrack}>
              <span style={{ width: `${total ? Math.round((present / total) * 100) : 0}%` }} />
            </span><strong>{present}/{total}</strong>
          </li>)}
        </ul>}
      </section>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>Distribución de participantes</h2></header>
        {distributionTotal ? <ul className={styles.managementBars}>
          {distribution.map(item => <li key={item.label}>
            <span>{item.label}</span><span className={styles.managementBarTrack}>
              <span style={{ width: `${Math.round((item.value / distributionTotal) * 100)}%` }} />
            </span><strong>{item.value}</strong>
          </li>)}
        </ul> : <p className={styles.managementEmpty}>No hay plantilla activa para resumir.</p>}
        <p>{people.size} participantes activos en equipos aprobados · {operations.views.length} equipos.</p>
      </section>
    </div>
  </section>;
}

function StaffDirectory({ data, search }: {
  data: Awaited<ReturnType<typeof staffDashboard>>;
  search: string;
}) {
  const query = search.trim().toLocaleLowerCase("es");
  const staff = data.accounts.filter(account =>
    (account.staff_status === "approved" || account.is_league_admin)
    && (!query || `${account.first_name} ${account.last_name} ${account.email} ${account.communities.map(item => item.name).join(" ")}`
      .toLocaleLowerCase("es").includes(query)));
  const admins = staff.filter(account => account.is_league_admin).length;
  const memberships = staff.reduce((count, account) => count + account.communities.length, 0);

  return <section className={styles.managementDashboard}>
    <div className={styles.managementGrid}>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>Staff activo</h2></header>
        <strong>{staff.length}</strong><p>Personas verificadas con acceso Staff o Admin League.</p>
      </section>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>Admin League</h2></header>
        <strong>{admins}</strong><p>El acceso se hereda de una comunidad o de una concesión directa.</p>
      </section>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>Vínculos comunitarios</h2></header>
        <strong>{memberships}</strong><p>Asignaciones activas a comunidades.</p>
      </section>
      <section className={`${styles.managementPanel} ${styles.managementPanelWide}`}>
        <header className={styles.managementPanelHeader}>
          <h2>Personas del equipo Staff</h2>
          <Link href="/gestion/comunidad">Gestionar comunidades →</Link>
        </header>
        <form method="get" className={styles.managementFilters}>
          <input type="search" name="buscar" defaultValue={search} placeholder="Buscar por nombre, correo o comunidad" aria-label="Buscar Staff" />
          <button type="submit">Buscar</button>
          {search ? <Link href="/gestion/staff">Limpiar</Link> : null}
        </form>
        {!staff.length ? <p className={styles.managementEmpty}>No hay personas Staff que coincidan con la búsqueda.</p> : <div className={styles.managementTableWrap}>
          <table className={styles.managementTable}>
            <thead><tr><th>Persona</th><th>Rol</th><th>Comunidad</th><th>Estado</th></tr></thead>
            <tbody>{staff.map(account => <tr key={account.id}>
              <td><div className={styles.managementPerson}>
                <span className={styles.managementPersonAvatar} aria-hidden="true">
                  {`${account.first_name[0] ?? ""}${account.last_name[0] ?? ""}`.toLocaleUpperCase("es")}
                </span>
                <span><strong>{account.first_name} {account.last_name}</strong><br /><small>{account.email}</small></span>
              </div></td>
              <td>{account.is_owner ? "Responsable" : account.is_league_admin ? "Admin League" : "Staff"}</td>
              <td>{account.communities.length
                ? account.communities.map(item => `${item.name}${item.role === "admin_league" ? " · Admin League" : ""}`).join(", ")
                : "Sin comunidad asignada"}</td>
              <td><span className={styles.managementPill}>Activo</span></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </div>
  </section>;
}

function RequestQueue({ data, isAdmin }: { data: Awaited<ReturnType<typeof staffDashboard>>; isAdmin: boolean }) {
  const pending = data.staff.filter(person => person.request_status === "pending").length;
  const approved = data.staff.filter(person => person.request_status === "approved").length;
  const resolved = data.staff.length - pending - approved;

  return <>
    <section className={styles.managementDashboard}>
      <div className={styles.managementGrid}>
        <section className={styles.managementPanel}>
          <header className={styles.managementPanelHeader}><h2>Pendientes de revisión</h2></header>
          <strong>{pending}</strong><p>Solicitudes que esperan una decisión.</p>
        </section>
        <section className={styles.managementPanel}>
          <header className={styles.managementPanelHeader}><h2>Staff aprobado</h2></header>
          <strong>{approved}</strong><p>Solicitudes con acceso activo a mundos asignados.</p>
        </section>
        <section className={styles.managementPanel}>
          <header className={styles.managementPanelHeader}><h2>Resueltas o retiradas</h2></header>
          <strong>{resolved}</strong><p>Solicitudes rechazadas, revocadas o canceladas.</p>
        </section>
        <section className={`${styles.managementPanel} ${styles.managementPanelWide}`}>
          <header className={styles.managementPanelHeader}>
            <h2>Solicitudes de Staff</h2>
            <Link href="/gestion/staff">Ver equipo Staff →</Link>
          </header>
          {!data.staff.length ? <p className={styles.managementEmpty}>No hay solicitudes de Staff.</p> : <div className={styles.managementQueue}>
            {data.staff.map(person => <details key={person.id} className={styles.managementQueueItem}>
              <summary>
                <span className={styles.managementPerson}>
                  <span className={styles.managementPersonAvatar} aria-hidden="true">
                    {`${person.first_name[0] ?? ""}${person.last_name[0] ?? ""}`.toLocaleUpperCase("es")}
                  </span>
                  <span>{person.first_name} {person.last_name}<br /><small>{person.email} · {person.community}</small></span>
                </span>
                <span className={styles.managementPill} data-tone={person.request_status === "pending" ? "warning" : person.request_status === "approved" ? "success" : "info"}>
                  {person.request_status}
                </span>
              </summary>
              {person.request_status === "pending" ? <>
                <ManagementForm action="review" values={{ id: person.id, kind: "staff", status: "approved" }} label="Aprobar Staff">
                  <label>Mundos asignados
                    <select name="worldIds" multiple required size={Math.min(5, Math.max(2, person.worlds.length))}>
                      {person.worlds.map(world => <option key={world.id} value={world.id}>{world.name}</option>)}
                    </select>
                  </label>
                  <p>Selecciona únicamente los mundos autorizados para la comunidad solicitante.</p>
                </ManagementForm>
                <ManagementForm action="review" values={{ id: person.id, kind: "staff", status: "rejected" }} label="Rechazar solicitud">
                  <label>Motivo<textarea name="reason" maxLength={1000} required /></label>
                </ManagementForm>
              </> : null}
              {person.request_status === "approved" ? <>
                <p>Mundos asignados: {person.assigned_worlds.map(world => world.name).join(", ") || "Ninguno"}</p>
                <ManagementForm action="update-staff-worlds" values={{ requestId: person.id }} label="Guardar ámbitos Staff">
                  <label>Mundos asignados
                    <select name="worldIds" multiple required defaultValue={person.assigned_worlds.map(world => world.id)} size={Math.min(5, Math.max(2, person.worlds.length))}>
                      {person.worlds.map(world => <option key={world.id} value={world.id}>{world.name}</option>)}
                    </select>
                  </label>
                </ManagementForm>
                <ManagementForm action="review" values={{ id: person.id, kind: "staff", status: "removed" }} label="Revocar acceso Staff" />
              </> : null}
            </details>)}
          </div>}
        </section>
        {isAdmin ? <section className={`${styles.managementPanel} ${styles.managementPanelWide}`}>
          <header className={styles.managementPanelHeader}><h2>Correo pendiente o fallido</h2></header>
          <p>Los correos se guardan antes del envío; solo se consideran enviados tras la confirmación del servicio SMTP.</p>
          <ManagementForm action="send-mail" label="Procesar correo pendiente" />
          {!data.mails.length ? <p className={styles.managementEmpty}>No hay correos pendientes ni fallidos.</p> : <ul className={styles.managementActivity}>
            {data.mails.map(mail => <li key={mail.id}>
              <strong>{mail.subject}</strong><span>{mail.recipient} · {mail.status}</span>
              {mail.last_error ? <p role="alert">{mail.last_error}</p> : null}
              {mail.status === "failed" ? <ManagementForm action="retry-mail" values={{ id: mail.id }} label="Volver a poner en cola" /> : null}
            </li>)}
          </ul>}
        </section> : null}
      </div>
    </section>
  </>;
}

function CommunityWorkspace({ user, data }: { user: User; data: Awaited<ReturnType<typeof staffDashboard>> }) {
  const activeCommunities = data.communities.filter(community => community.active).length;
  const adminCommunities = data.communities.filter(community => community.role === "admin_league").length;
  const activeWorlds = data.communities.reduce((count, community) =>
    count + community.worlds.filter(world => world.active).length, 0);

  return <>
    <section className={styles.managementDashboard}>
      <div className={styles.managementGrid}>
        <section className={styles.managementPanel}>
          <header className={styles.managementPanelHeader}><h2>Comunidades activas</h2></header>
          <strong>{activeCommunities}</strong><p>De {data.communities.length} comunidades registradas.</p>
        </section>
        <section className={styles.managementPanel}>
          <header className={styles.managementPanelHeader}><h2>Roles Admin League</h2></header>
          <strong>{adminCommunities}</strong><p>Los permisos dependen del rol asignado a cada comunidad.</p>
        </section>
        <section className={styles.managementPanel}>
          <header className={styles.managementPanelHeader}><h2>Ámbitos activos</h2></header>
          <strong>{activeWorlds}</strong><p>Asignaciones de mundo activas entre comunidades.</p>
        </section>
        <section className={`${styles.managementPanel} ${styles.managementPanelWide}`}>
          <header className={styles.managementPanelHeader}><h2>Comunidades y ámbitos</h2></header>
          {!data.communities.length ? <p className={styles.managementEmpty}>No hay comunidades configuradas.</p> : <div className={styles.managementQueue}>
            {data.communities.map(community => <details key={community.id} className={styles.managementQueueItem}>
              <summary>
                <span>{community.name}</span>
                <span className={styles.managementPill} data-tone={community.active ? "success" : "danger"}>
                  {community.active ? "Activa" : "Inactiva"} · {community.role === "admin_league" ? "Admin League" : "Staff"}
                </span>
              </summary>
              <p>{community.worlds.filter(world => world.active).map(world => world.name).join(" · ") || "Sin mundos activos"}</p>
              <div className={styles.managementTabs} aria-label={`Mundos de ${community.name}`}>
                {community.worlds.map(world => <span key={world.id} aria-current={world.active ? "page" : undefined}>
                  {world.name} · {world.active ? "Activo" : "Inactivo"}
                </span>)}
              </div>
              {user.is_owner ? <ManagementForm action="community-role" values={{ communityId: community.id }} label="Guardar rol de comunidad">
                <label>Rol<select name="role" defaultValue={community.role}>
                  <option value="staff">Staff</option><option value="admin_league">Admin League</option>
                </select></label>
                <label>Motivo<textarea name="reason" maxLength={1000} required /></label>
              </ManagementForm> : null}
            </details>)}
          </div>}
        </section>
        <section className={styles.managementPanel}>
          <header className={styles.managementPanelHeader}><h2>Crear comunidad</h2></header>
          <ManagementForm action="create-community" label="Crear comunidad">
            <label>Nombre<input name="name" maxLength={120} required /></label>
            <label>Rol<select name="role" defaultValue="staff">
              <option value="staff">Staff</option>
              {user.is_owner ? <option value="admin_league">Admin League</option> : null}
            </select></label>
            <label className="management-check"><input name="eligible" type="checkbox" />Permitir solicitudes de Staff</label>
          </ManagementForm>
        </section>
        <section className={styles.managementPanel}>
          <header className={styles.managementPanelHeader}><h2>Asignar mundo a comunidad</h2></header>
          <ManagementForm action="assign-community-world" label="Guardar ámbito comunitario">
            <label>Comunidad<select name="communityId" required>{data.communities.map(community =>
              <option key={community.id} value={community.id}>{community.name}</option>)}</select></label>
            <label>Mundo<select name="worldId" required>{data.worlds.map(world =>
              <option key={world.id} value={world.id}>{world.name}</option>)}</select></label>
            <label className="management-check"><input name="active" type="checkbox" defaultChecked />Asignación activa</label>
            <label>Motivo<textarea name="reason" maxLength={1000} required /></label>
          </ManagementForm>
        </section>
        {user.is_owner ? <section className={`${styles.managementPanel} ${styles.managementPanelWide}`}>
          <header className={styles.managementPanelHeader}><h2>Concesiones directas Admin League</h2></header>
          <p>Los permisos heredados de una comunidad se administran desde su rol; aquí solo aparecen concesiones directas.</p>
          <ul className={styles.managementActivity}>{data.accounts.filter(account => account.explicit_league_admin && !account.is_owner).map(account =>
            <li key={account.id}><strong>{account.first_name} {account.last_name}</strong><div>{account.email}
              <ManagementForm action="revoke-league-admin" values={{ userId: account.id }} label="Retirar concesión directa" />
            </div></li>)}</ul>
          <ManagementForm action="grant-league-admin" label="Conceder Admin League">
            <label>Cuenta verificada<select name="userId" required>
              {data.accounts.filter(account => !account.is_owner && !account.is_league_admin).map(account =>
                <option key={account.id} value={account.id}>{account.first_name} {account.last_name} · {account.email}</option>)}
            </select></label>
          </ManagementForm>
        </section> : null}
      </div>
    </section>
    <OperationsPanel user={user} section="community" />
  </>;
}

export async function ManagementIntranetPage({ user, screen, search = "", selectedWorldId }: {
  user: User;
  screen: ManagementScreen;
  search?: string;
  selectedWorldId?: string;
}) {
  if (!hasControlCenterAccess(user)) return <article className="page-content">
    <h1>Acceso pendiente</h1>
    <p>Necesitas aprobación de Staff para gestionar la League.</p>
    <Link href="/mi-equipo">Volver a mi aventura</Link>
  </article>;

  const isAdmin = Boolean(user.is_owner || user.is_league_admin);
  if (["staff", "staff-directory", "community"].includes(screen) && !isAdmin) notFound();
  const [data, operations] = await Promise.all([
    staffDashboard(user),
    screen === "control" ? operationsDashboard(user) : Promise.resolve(null),
  ]);
  const participantCount = operations
    ? new Set(operations.views.flatMap(view => view.originals.filter(person => person.active).map(person => person.id))).size
    : 0;
  const activeStaffCount = data.accounts.filter(account => account.staff_status === "approved" || account.is_league_admin).length;
  const info = screen === "worlds" && isAdmin
    ? { title: "Todos los mundos", description: "Como Admin League tienes acceso a los equipos, la asistencia y el progreso de todos los mundos." }
    : screens[screen];
  const metrics = screen === "control" ? [
    { label: "Participantes activos", value: String(participantCount) },
    { label: "Equipos aprobados", value: String(operations?.views.length ?? 0) },
    ...(isAdmin ? [
      { label: "Staff activo", value: String(activeStaffCount) },
      { label: "Comunidades", value: String(data.communities.length) },
      { label: "Solicitudes Staff pendientes", value: String(data.staff.filter(person => person.request_status === "pending").length) },
      { label: "Entregas por revisar", value: String(operations?.submissions.filter(item => item.current && item.status === "pending").length ?? 0) },
    ] : []),
  ] : screen === "staff" ? [
    { label: "Pendientes", value: String(data.staff.filter(person => person.request_status === "pending").length) },
    { label: "Aprobadas", value: String(data.staff.filter(person => person.request_status === "approved").length) },
    { label: "Correos por procesar", value: String(data.mails.length) },
  ] : screen === "staff-directory" ? [
    { label: "Staff activo", value: String(activeStaffCount) },
    { label: "Admin League", value: String(data.accounts.filter(account => account.is_league_admin).length) },
    { label: "Comunidades", value: String(data.communities.length) },
  ] : screen === "community" ? [
    { label: "Comunidades activas", value: String(data.communities.filter(community => community.active).length) },
    { label: "Staff activo", value: String(activeStaffCount) },
    { label: "Solicitudes Staff pendientes", value: String(data.staff.filter(person => person.request_status === "pending").length) },
  ] : [];
  const shellProps = {
    active: screen,
    title: info.title,
    description: info.description,
    userName: `${user.first_name} ${user.last_name}`,
    role: isAdmin ? "Admin League" : "Staff",
    metrics,
    staff: true,
    admin: isAdmin,
  };

  if (screen === "control" && operations) return <IntranetShell {...shellProps}>
    <ControlDashboard staffData={data} operations={operations} isAdmin={isAdmin} />
  </IntranetShell>;

  if (screen === "staff") return <IntranetShell {...shellProps}><RequestQueue data={data} isAdmin={isAdmin} /></IntranetShell>;
  if (screen === "staff-directory") return <IntranetShell {...shellProps}><StaffDirectory data={data} search={search} /></IntranetShell>;
  if (screen === "community") return <IntranetShell {...shellProps}><CommunityWorkspace user={user} data={data} /></IntranetShell>;
  if (screen === "challenges") return <IntranetShell {...shellProps}>
    <section className={styles.managementDashboard}>
      <div className={styles.managementGrid}>
        <article className={styles.managementHero}>
          <div>
            <p className={styles.featureLabel}>CONTENIDO · REPOSITORIO OFICIAL</p>
            <h2>Retos y soluciones</h2>
            <p>Los retos se redactan, revisan y publican en el repositorio público de la League.</p>
            <a className="button-link" href={`https://github.com/${OFFICIAL_REPOSITORY}`} target="_blank" rel="noopener noreferrer">Abrir repositorio de retos</a>
          </div>
          <img src={worldArt[1]} alt="" />
        </article>
        <section className={`${styles.managementPanel} ${styles.managementPanelWide}`}>
          <header className={styles.managementPanelHeader}><h2>Publicación en GitHub</h2></header>
          <p>No hay un panel para editar la configuración fija de League. El contenido oficial de los retos se mantiene en GitHub; la evaluación y publicación de soluciones se gestionan por separado.</p>
          <p><Link href="/gestion/evaluaciones">Ir a evaluaciones y rúbricas</Link> · <Link href="/gestion/entregas">Revisar entregas</Link></p>
        </section>
      </div>
    </section>
  </IntranetShell>;

  return <IntranetShell {...shellProps}>
    {screen === "teams" && isAdmin ? <section className={styles.managementDashboard}>
      <div className={styles.managementGrid}>
        <section className={`${styles.managementPanel} ${styles.managementPanelWide}`}>
          <header className={styles.managementPanelHeader}><h2>Equipos pendientes de validación</h2></header>
          {!data.teams.length ? <p className={styles.managementEmpty}>No hay equipos pendientes de validación.</p> : <div className={styles.managementQueue}>
            {data.teams.map(team => <details className={styles.managementQueueItem} key={team.id}>
              <summary>
                <span className={styles.managementPerson}>
                  {team.logo_asset_id
                    ? <img className={styles.managementPersonAvatar} src={`/api/equipos/${team.id}/logo`} alt="" />
                    : <span className={styles.managementPersonAvatar} aria-hidden="true">{team.name.slice(0, 2).toLocaleUpperCase("es")}</span>}
                  <span>{team.name}<br /><small>Capitán: {team.captain_email}</small></span>
                </span>
                <span className={styles.managementPill} data-tone="warning">Pendiente</span>
              </summary>
              <div className={styles.managementTableWrap}>
                <table className={styles.managementTable}>
                  <thead><tr><th>Plantilla</th><th>Correo</th></tr></thead>
                  <tbody>{team.members.map(member => <tr key={member.id}>
                    <td>{member.first_name} {member.last_name}</td><td>{member.email}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              <ManagementForm action="review" values={{ id: team.id, kind: "team", status: "approved" }} label="Aprobar equipo" />
              <ManagementForm action="review" values={{ id: team.id, kind: "team", status: "correction" }} label="Pedir corrección">
                <label>Motivo<textarea name="reason" maxLength={1000} required /></label>
              </ManagementForm>
              <ManagementForm action="review" values={{ id: team.id, kind: "team", status: "rejected" }} label="Rechazar equipo">
                <label>Motivo<textarea name="reason" maxLength={1000} required /></label>
              </ManagementForm>
            </details>)}
          </div>}
        </section>
      </div>
    </section> : null}
    <OperationsPanel user={user} section={screen} search={search} selectedWorldId={selectedWorldId} />
  </IntranetShell>;
}
