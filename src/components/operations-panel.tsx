import Link from "next/link";
import { ManagementForm } from "./management-form";
import { operationsDashboard } from "../lib/management/operations";
import type { User } from "../lib/management/service";
import { githubDashboard } from "../lib/management/github";
import { OFFICIAL_REPOSITORY, oauthSettings } from "../lib/management/github-api";
import { MissionDelivery } from "./mission-delivery";
import styles from "./intranet-shell.module.css";

const managementSectionPaths: Record<string, string> = {
  teams: "equipos",
  participants: "participantes",
  deliveries: "entregas",
  evaluations: "evaluaciones",
  points: "puntos",
};

function Reason() {
  return <label>Motivo / comprobación<textarea name="reason" maxLength={1000} required /></label>;
}

const worldArt = [
  "/images/Tech%20Riders%20League%20I.png",
  "/images/Tech%20Riders%20League%20II.png",
  "/images/Tech%20Riders%20League%20III.png",
  "/images/Tech%20Riders%20League%20IV.png",
  "/images/Tech%20Riders%20League%20Final.png",
] as const;

function WorldWorkspace({ data, teamId, selectedWorldId }: {
  data: Awaited<ReturnType<typeof operationsDashboard>>;
  teamId?: string;
  selectedWorldId?: string;
}) {
  const isManagement = !teamId;
  const event = data.events.find(item => item.id === selectedWorldId)
    ?? data.events.find(item => item.id === "datos")
    ?? data.events[0];
  if (!event) return <section className={styles.worldEmpty}><h2>No hay mundos disponibles</h2><p>No hay mundos asignados a esta cuenta.</p></section>;

  const image = worldArt[event.ordinal - 1] ?? worldArt[0];
  const challenge = data.challenges.find(item => item.event_id === event.id);
  const teams = data.views.flatMap(view => {
    const world = view.worlds.find(item => item.event.id === event.id);
    return world ? [{ view, world }] : [];
  });
  const people = teams.flatMap(item => item.world.people);
  const submissions = data.submissions.filter(item => item.event_id === event.id && item.current);
  const attendanceCount = people.filter(person => person.present).length;
  const points = data.movements.filter(item => item.event_id === event.id).reduce((sum, item) => sum + item.points, 0);
  const status = event.closed || challenge?.status === "closed"
    ? "Cerrado"
    : challenge?.status === "published" ? "Publicado" : "En preparación";
  const baseHref = teamId ? "/mi-equipo/misiones" : "/gestion/mundos";

  return <section className={styles.worldWorkspace}>
    <nav className={styles.worldSelector} aria-label="Seleccionar mundo">
      {data.events.map(item => <Link key={item.id} href={`${baseHref}?mundo=${encodeURIComponent(item.id)}`}
        aria-current={item.id === event.id ? "page" : undefined}>
        <img src={worldArt[item.ordinal - 1] ?? worldArt[0]} alt="" />
        <span><small>M{item.ordinal}</small><strong>{item.name}</strong></span>
      </Link>)}
    </nav>

    <section id="world-info" className={styles.worldOverview}>
      <img src={image} alt="" />
      <div>
        <p className={styles.featureLabel}>MUNDO {event.ordinal} · TEMPORADA 2027</p>
        <h2>{event.name}</h2>
        <p>{challenge?.description || challenge?.objective || "Consulta el reto, el estado de las entregas y el progreso de este mundo."}</p>
        <span className={styles.statusBadge}>{status}</span>
      </div>
      {isManagement ? <p className={styles.worldCodeNote}>La configuración oficial se mantiene en código. Los retos se publican desde GitHub.</p> : null}
    </section>

    <nav className={styles.worldTabs} aria-label="Secciones del mundo">
      <a href="#world-info" aria-current="page">Información del mundo</a>
      <a href="#world-challenge">Retos</a>
      <a href="#world-deliveries">{isManagement ? "Soluciones" : "Entregables"}</a>
      <a href="#world-participants">Participantes</a>
      <a href="#world-statistics">Estadísticas</a>
    </nav>

    <section id="world-statistics" className={styles.worldStats}>
      <h2>Estado del mundo</h2>
      <div>
        <article><strong>{teams.length}</strong><span>Equipos aprobados</span></article>
        <article><strong>{people.length}</strong><span>Participantes inscritos</span></article>
        <article><strong>{submissions.filter(item => item.kind === "challenge").length}</strong><span>Entregas de reto</span></article>
        <article><strong>{people.length ? `${attendanceCount}/${people.length}` : "—"}</strong><span>Asistencias validadas</span></article>
        <article><strong>{points.toLocaleString("es-ES")}</strong><span>Puntos asignados</span></article>
      </div>
    </section>

    <section id="world-challenge" className={styles.worldChallenge}>
      <div>
        <p className={styles.featureLabel}>RETO DEL MUNDO</p>
        <h2>{challenge?.title ?? "Reto todavía no publicado"}</h2>
        <p>{challenge?.description || challenge?.instructions || "El reto aparecerá aquí cuando se publique."}</p>
      </div>
      {isManagement ? <a className="button-link" href={`https://github.com/${OFFICIAL_REPOSITORY}`} target="_blank" rel="noopener noreferrer">Abrir repositorio de retos</a> : null}
      {challenge?.deadline ? <time dateTime={challenge.deadline.toISOString()}>Fecha límite: {new Date(challenge.deadline).toLocaleString("es-ES", { timeZone: challenge.timezone || "Europe/Madrid" })}</time> : null}
    </section>
  </section>;
}

function RankingReview({ scope, preview }: {
  scope: string;
  preview: { rows: { id: string; equipo: string; puntos: number }[]; pending: boolean; fingerprint: string };
}) {
  return <section className="management-card">
    <h3>{scope === "global" ? "Global" : scope.startsWith("bonus:") ? "Orden del bonus" : "Vista previa de puntos"}</h3>
    <ol>{preview.rows.map(row => <li key={row.id}>{row.equipo} · {row.puntos} puntos <small>({row.id})</small></li>)}</ol>
    {!preview.rows.length ? <p>Aún no hay resultados validados.</p> : null}
    {preview.pending ? <>
      <p role="status">Empate pendiente. Solo se puede cambiar el orden entre equipos empatados.</p>
      <ManagementForm action="resolve-tie" values={{ scope, fingerprint: preview.fingerprint }} label="Registrar desempate">
        <label>Orden completo de identificadores (separados por comas)<textarea name="order" defaultValue={preview.rows.map(r => r.id).join(",")} maxLength={4000} required /></label>
        <Reason />
      </ManagementForm>
    </> : !scope.startsWith("bonus:") ? <ManagementForm action="publish-results" values={{ scope, fingerprint: preview.fingerprint }} label="Publicar esta clasificación revisada" /> : <p>Bonus sin empates pendientes.</p>}
  </section>;
}

function OperationsScreenOverview({ section, data, search, isAdmin, selectedWorldId }: {
  section: string;
  data: Awaited<ReturnType<typeof operationsDashboard>>;
  search: string;
  isAdmin: boolean;
  selectedWorldId?: string;
}) {
  const query = search.trim().toLocaleLowerCase("es");
  const sectionPath = `/gestion/${managementSectionPaths[section] ?? section}`;
  const worldTeams = data.views.filter(view =>
    !selectedWorldId || view.worlds.some(world => world.event.id === selectedWorldId));
  const teams = worldTeams.filter(view => !query || view.team.name.toLocaleLowerCase("es").includes(query));
  const activeSubmissions = data.submissions.filter(item =>
    item.current && (!selectedWorldId || item.event_id === selectedWorldId));
  const submissionRows = activeSubmissions.filter(item => {
    const team = data.views.find(view => view.team.id === item.team_id)?.team.name ?? "";
    return !query || `${team} ${item.event_id} ${item.commit_sha ?? ""}`.toLocaleLowerCase("es").includes(query);
  });
  const people = worldTeams.flatMap(view => view.originals.map(person => ({ view, person })))
    .filter(({ view, person }) => !query || `${person.first_name} ${person.last_name} ${person.email} ${view.team.name}`.toLocaleLowerCase("es").includes(query));
  const teamPoints = new Map<string, number>();
  for (const movement of data.movements) {
    teamPoints.set(movement.team_id, (teamPoints.get(movement.team_id) ?? 0) + movement.points);
  }
  const ledger = data.ledger.filter(entry => !selectedWorldId || entry.event_id === selectedWorldId);
  const totalPoints = ledger.reduce((sum, entry) => sum + entry.points, 0);
  const previews = data.previews.filter(({ event }) => !selectedWorldId || event.id === selectedWorldId);
  const pendingSubmissions = activeSubmissions.filter(item => item.status === "pending").length;
  const evaluatedSubmissions = activeSubmissions.filter(item => item.status === "approved").length;
  const overviewTitle = section === "evaluations" ? "Entregas y evaluaciones"
    : section === "deliveries" ? "Entregas recibidas"
      : section === "points" ? "Sistema de puntos"
        : section === "participants" ? "Directorio de participantes" : "Equipos";

  if (!["teams", "participants", "deliveries", "evaluations", "points"].includes(section)) return null;

  return <section className={styles.managementDashboard} aria-label={overviewTitle}>
    {data.events.length > 1 && ["teams", "participants", "deliveries", "evaluations", "points"].includes(section) ? <nav className={styles.managementTabs} aria-label="Filtrar por mundo">
      <Link href={sectionPath} aria-current={!selectedWorldId ? "page" : undefined}>Todos los mundos</Link>
      {data.events.map(event => <Link key={event.id} href={`${sectionPath}?mundo=${encodeURIComponent(event.id)}`}
        aria-current={selectedWorldId === event.id ? "page" : undefined}>Mundo {event.ordinal} · {event.name}</Link>)}
    </nav> : null}
    {section === "teams" ? <div className={styles.managementGrid}>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>Equipos validados</h2></header>
        <strong>{data.views.length}</strong><p>Equipos activos disponibles en tu ámbito.</p>
      </section>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>{isAdmin ? "Elegibles para la final" : "Mundos en tu ámbito"}</h2></header>
        <strong>{isAdmin ? data.views.filter(view => view.eligibility.eligible).length : data.events.length}</strong>
        <p>{isAdmin ? "Según los criterios oficiales de participación." : "Solo se muestran los mundos asignados a tu cuenta."}</p>
      </section>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>Revisión pendiente</h2></header>
        <strong>{pendingSubmissions}</strong><p>Entregas actuales pendientes de revisión.</p>
      </section>
      <section className={`${styles.managementPanel} ${styles.managementPanelWide}`}>
        <header className={styles.managementPanelHeader}>
          <h2>Equipos aprobados</h2>{isAdmin ? <a href="/api/gestion/export">Exportar CSV</a> : null}
        </header>
        <form method="get" className={styles.managementFilters}>
          <input type="search" name="equipo" defaultValue={search} placeholder="Buscar equipo" aria-label="Buscar equipo" />
          <button type="submit">Buscar</button>
          {search ? <Link href={sectionPath}>Limpiar</Link> : null}
        </form>
        {!teams.length ? <p className={styles.managementEmpty}>No hay equipos aprobados que coincidan con la búsqueda.</p> : <div className={styles.managementTableWrap}>
          <table className={styles.managementTable}>
            <thead><tr><th>#</th><th>Equipo</th><th>Plantilla</th>{isAdmin ? <th>Mundos válidos</th> : null}<th>Estado</th>{isAdmin ? <th>Clasificación</th> : null}</tr></thead>
            <tbody>{teams.map((view, index) => <tr key={view.team.id}>
              <td>{index + 1}</td><td><a href="#gestion-equipos">{view.team.name}</a></td>
              <td>{view.originals.filter(person => person.active).length}</td>
              {isAdmin ? <td>{view.eligibility.worlds}/{data.rules.minimum_worlds_for_final}</td> : null}
              <td><span className={styles.managementPill}>Validado</span></td>
              {isAdmin ? <td>{view.eligibility.eligible ? "Candidato a la final" : "En progreso"}</td> : null}
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </div> : null}

    {section === "participants" ? <div className={styles.managementGrid}>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>Personas en equipos aprobados</h2></header>
        <strong>{people.filter(({ person }) => person.active).length}</strong><p>Integrantes activos de equipos en tu ámbito autorizado.</p>
      </section>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>Capitanes</h2></header>
        <strong>{new Set(people.filter(({ person, view }) => person.active && person.id === view.team.captain_id).map(({ person }) => person.id)).size}</strong>
        <p>Los puntos se mantienen asociados al equipo, no a cuentas individuales.</p>
      </section>
      <section className={`${styles.managementPanel} ${styles.managementPanelWide}`}>
        <header className={styles.managementPanelHeader}>
          <h2>Participantes</h2>{isAdmin ? <a href="/api/gestion/export">Exportar listado</a> : null}
        </header>
        <form method="get" className={styles.managementFilters}>
          <input type="search" name="buscar" defaultValue={search} placeholder="Buscar nombre, correo o equipo" aria-label="Buscar participante" />
          <button type="submit">Buscar</button>
          {search ? <Link href={sectionPath}>Limpiar</Link> : null}
        </form>
        {!people.length ? <p className={styles.managementEmpty}>No hay participantes que coincidan con la búsqueda.</p> : <div className={styles.managementTableWrap}>
          <table className={styles.managementTable}>
            <thead><tr><th>Nombre</th><th>Equipo</th><th>Rol</th><th>Tipo de plaza</th><th>Estado</th></tr></thead>
            <tbody>{people.map(({ view, person }) => <tr key={`${view.team.id}:${person.id}`}>
              <td><strong>{person.first_name} {person.last_name}</strong><br /><small>{person.email}</small></td>
              <td>{view.team.name}</td>
              <td>{person.id === view.team.captain_id ? "Capitán" : "Participante"}</td>
              <td>{person.original ? "Original" : "Sustituto"}</td>
              <td><span className={styles.managementPill} data-tone={person.active ? "success" : "warning"}>{person.active ? "Activo" : "Inactivo"}</span></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </div> : null}

    {section === "deliveries" || section === "evaluations" ? <div className={styles.managementGrid}>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>Equipos</h2></header>
        <strong>{teams.length}</strong><p>Equipos aprobados en los mundos accesibles.</p>
      </section>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>Entregas recibidas</h2></header>
        <strong>{activeSubmissions.length}</strong><p>Entregas actuales; las versiones previas quedan en el historial.</p>
      </section>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>{section === "evaluations" ? "Evaluadas" : "Pendientes"}</h2></header>
        <strong>{section === "evaluations" ? evaluatedSubmissions : pendingSubmissions}</strong>
        <p>{section === "evaluations" ? "Entregas aprobadas a la espera o con evaluación registrada." : "Entregas que requieren una primera revisión."}</p>
      </section>
      <section className={`${styles.managementPanel} ${styles.managementPanelWide}`}>
        <header className={styles.managementPanelHeader}>
          <h2>{overviewTitle}</h2><Link href="/gestion/mundos">Filtrar por mundo →</Link>
        </header>
        <form method="get" className={styles.managementFilters}>
          <input type="search" name="buscar" defaultValue={search} placeholder="Buscar equipo, mundo o SHA" aria-label="Buscar entrega" />
          <button type="submit">Buscar</button>
          {search ? <Link href={`/gestion/${section}`}>Limpiar</Link> : null}
        </form>
        {!submissionRows.length ? <p className={styles.managementEmpty}>No hay entregas actuales en los mundos accesibles.</p> : <div className={styles.managementTableWrap}>
          <table className={styles.managementTable}>
            <thead><tr><th>Equipo</th><th>Mundo</th><th>Commit</th><th>Entrega</th><th>Estado</th><th>Fecha</th></tr></thead>
            <tbody>{submissionRows.map(item => <tr key={item.id}>
              <td>{data.views.find(view => view.team.id === item.team_id)?.team.name ?? "Equipo"}</td>
              <td>{data.events.find(event => event.id === item.event_id)?.name ?? item.event_id}</td>
              <td>{item.commit_sha ? item.commit_sha.slice(0, 7) : "—"}</td>
              <td><a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.kind === "photo" ? "Foto" : "Abrir entrega"}
              </a></td>
              <td><span className={styles.managementPill} data-tone={item.status === "approved" ? "success" : item.status === "pending" ? "warning" : "danger"}>{item.status}</span></td>
              <td>{new Date(item.submitted_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <p>La evaluación se mantiene vinculada al SHA exacto y a la versión publicada de la rúbrica.</p>
      </section>
    </div> : null}

    {section === "points" ? <div className={styles.managementGrid}>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>Puntos netos del ledger</h2></header>
        <strong>{totalPoints.toLocaleString("es-ES")}</strong><p>Incluye correcciones y reversiones inmutables.</p>
      </section>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>Movimientos registrados</h2></header>
        <strong>{ledger.length}</strong><p>Movimientos disponibles en el ámbito seleccionado.</p>
      </section>
      <section className={styles.managementPanel}>
        <header className={styles.managementPanelHeader}><h2>Clasificaciones por revisar</h2></header>
        <strong>{previews.length + (isAdmin && data.global && !selectedWorldId ? 1 : 0)}</strong><p>Publica solo después de comprobar empates.</p>
      </section>
        {isAdmin && data.global && !selectedWorldId ? <section className={`${styles.managementPanel} ${styles.managementPanelWide}`}>
        <header className={styles.managementPanelHeader}>        <h2>Vista previa global por equipos · no publicada</h2></header>
        {!data.global.rows.length ? <p className={styles.managementEmpty}>Aún no hay resultados para clasificar.</p> : <div className={styles.managementTableWrap}>
          <table className={styles.managementTable}>
            <thead><tr><th>Posición provisional</th><th>Equipo</th><th>Puntos</th></tr></thead>
            <tbody>{data.global.rows.slice(0, 10).map((row, index) => <tr key={row.id}>
              <td>{index + 1}</td><td>{row.equipo}</td><td>{row.puntos.toLocaleString("es-ES")}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section> : null}
      <section className={`${styles.managementPanel} ${styles.managementPanelWide}`}>
        <header className={styles.managementPanelHeader}><h2>Ledger reciente</h2></header>
        {!ledger.length ? <p className={styles.managementEmpty}>No hay movimientos de puntos.</p> : <div className={styles.managementTableWrap}>
          <table className={styles.managementTable}>
            <thead><tr><th>Fecha</th><th>Equipo</th><th>Mundo</th><th>Concepto</th><th>Puntos</th><th>Motivo</th></tr></thead>
            <tbody>{ledger.slice(0, 20).map(entry => <tr key={entry.id}>
              <td>{new Date(entry.created_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</td>
              <td>{entry.team_name}</td><td>{data.events.find(event => event.id === entry.event_id)?.name ?? entry.event_id}</td>
              <td>{entry.concept}</td><td>{entry.points > 0 ? "+" : ""}{entry.points}</td><td>{entry.reason}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <p>La puntuación pertenece al equipo; el sistema no atribuye puntos individuales.</p>
      </section>
    </div> : null}
  </section>;
}

export async function OperationsPanel({ user, teamId, search = "", section, selectedWorldId }: {
  user: User;
  teamId?: string;
  search?: string;
  section?: string;
  selectedWorldId?: string;
}) {
  const data = await operationsDashboard(user, teamId);
  const github = await githubDashboard(user, teamId);
  const staff = !teamId;
  const isAdmin = Boolean(user.is_owner || user.is_league_admin);
  const show = (...sections: string[]) => !section || sections.includes(section);
  const worldScreen = section === "worlds" || section === "missions";
  const accountOptions = data.accounts.map(p => <option value={p.id} key={p.id}>{p.first_name} {p.last_name} · {p.email}</option>);
  const participantOptions = data.accounts.map(p => <option value={p.id} key={p.id}>{p.first_name} {p.last_name} · {p.email}</option>);
  if (data.season.retired_at) return <section><h2>Temporada archivada</h2><p>Se han retirado los datos personales de participación. El ranking histórico permanece anonimizado.</p></section>;
  return <>
    {staff && section ? <OperationsScreenOverview section={section} data={data} search={search} isAdmin={isAdmin} selectedWorldId={selectedWorldId} /> : null}
    {worldScreen ? <WorldWorkspace data={data} teamId={teamId} selectedWorldId={selectedWorldId} /> : null}
    {show("all", "points") ? <details className="management-section" open={section === "points"}><summary>Ledger inmutable de puntos ({data.ledger.length} movimientos)</summary>
      <span id="gestion-puntos" className="sr-only" />
      <ul>{data.ledger.map(entry => <li key={entry.id}>
        {entry.team_name} · {entry.event_id} · {entry.concept} · {entry.points > 0 ? "+" : ""}{entry.points}
        {entry.reversal_of_entry_id ? ` · Reversa ${entry.reversal_of_entry_id}` : ""} · {entry.reason} · {new Date(entry.created_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}
      </li>)}</ul>
    </details> : null}
    {isAdmin && show("all", "points") ? <details className="management-section" open={section === "points"}>
      <summary>Vouchers y premios</summary>
      <p>El sorteo se realiza por organización; aquí se registra la adjudicación tras comprobar presencia al final y el cupo 5/5/5/5/10.</p>
      <ManagementForm action="award" values={{ kind: "voucher" }} label="Registrar voucher adjudicado">
        <label>Mundo<select name="eventId">{data.events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label>Persona<select name="userId" required>{participantOptions}</select></label>
        <label>Descripción<input name="description" maxLength={500} required /></label><Reason />
      </ManagementForm>
      <ManagementForm action="award" values={{ kind: "prize" }} label="Registrar premio de podio">
        <label>Clasificación<select name="eventId"><option value="">Global</option>{data.events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label>Equipo<select name="teamId">{data.views.map(v => <option key={v.team.id} value={v.team.id}>{v.team.name}</option>)}</select></label>
        <label>Premio confirmado<input name="description" maxLength={500} required /></label><Reason />
      </ManagementForm>
      <ul>{data.awards.map(a => <li key={a.id}>{a.description} · {a.kind} · {a.delivered ? "Entregado" : "Pendiente"}
        <ManagementForm action="award" values={{ id: a.id }} label="Guardar entrega">
          <label className="management-check"><input name="delivered" type="checkbox" defaultChecked={a.delivered} />Entregado</label><Reason />
        </ManagementForm>
        <ManagementForm action="award" values={{ id: a.id }} label="Retirar adjudicación"><label className="management-check"><input type="checkbox" name="remove" required />Confirmo retirada</label><Reason /></ManagementForm>
      </li>)}</ul>
    </details> : null}
    {show("all", "teams", "worlds", "deliveries", "evaluations", "participants", "missions") ? <details className="management-section" open={!staff || !section || worldScreen || Boolean(search)}><summary>{staff ? "Operación de equipos y mundos" : "Mundos de mi equipo"}</summary>
      {staff ? <span id="gestion-equipos" className="sr-only" /> : null}
      {staff ? <form method="get" className="management-form"><label>Buscar equipo<input name="equipo" type="search" /></label><button>Buscar</button></form> : null}
      {staff && isAdmin ? <a className="button-link" href="/api/gestion/export">Exportar equipos y asistencia (CSV para Excel)</a> : null}
      {!data.views.length ? <p>No hay equipos aprobados disponibles.</p> : null}
      {data.views.length ? <h3 id={staff ? "gestion-participantes" : undefined}>Equipos y participantes</h3> : null}
      {worldScreen ? <span id="world-participants" className="sr-only" /> : null}
      {staff ? <p id="gestion-entregas">Entregas, evaluaciones y progreso por mundo.</p> : null}
      {worldScreen ? <span id="world-deliveries" className="sr-only" /> : null}
      {data.views.filter(v => v.team.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"))).map(view => <details key={view.team.id} className="management-card" open={!staff || worldScreen || Boolean(search)}>
        <summary>{view.team.name}{isAdmin
          ? ` · ${view.eligibility.worlds}/${data.rules.minimum_worlds_for_final} mundos válidos · ${view.eligibility.eligible ? "Candidato a la final" : "Aún no candidato"}`
          : ` · ${view.worlds.length} mundos en tu ámbito`}</summary>
        {!view.team.captain_active ? <p role="status">Nuevo capitán pendiente de activar su contraseña. El anterior ya no puede gestionar. Si el enlace ha caducado, usa «¿Has olvidado tu contraseña?» en Iniciar sesión para solicitar otro.</p> : null}
        <h3>Plantilla e historial</h3>
        <ul>{view.originals.map(p => <li key={p.id}>{p.first_name} {p.last_name} · {p.original ? "Original" : "Relevo por fuerza mayor"} · {p.active ? "Activo" : "Baja lógica"}</li>)}</ul>
        {!staff && view.team.captain_id === user.id && view.team.captain_active ? <section>
          <h3>Preparar misiones</h3>
          {!github.enabled ? <p>Integración GitHub pendiente de configuración por organización. No se admiten entregas de código por enlaces públicos.</p> : <>
            <p>Solo el capitán necesita GitHub. Crea un repositorio privado propio (sin fork) e instala la App únicamente en ese repositorio. Nunca lo hagas público durante la competición ni la evaluación.</p>
            <p>Cuenta: {github.accounts.find(a => a.user_id === user.id)?.login ?? "Sin vincular"} · Repositorio: {github.repositories.find(r => r.team_id === view.team.id && r.captain_id === user.id)?.full_name ?? "Sin conectar para el capitán actual"}</p>
            <ManagementForm action="github-link" values={{ teamId: view.team.id }} label="Vincular GitHub" />
            <a href={`https://github.com/apps/${encodeURIComponent(oauthSettings().slug)}/installations/new`} target="_blank" rel="noopener noreferrer">Autorizar la App para mi repositorio privado</a>
            <ManagementForm action="github-link" values={{ teamId: view.team.id }} label="Conectar repositorio privado">
              <label>Repositorio (propietario/nombre)<input name="repository" maxLength={140} placeholder="mi-cuenta/mi-equipo" required /></label>
            </ManagementForm>
          </>}
        </section> : null}
        {view.worlds.filter(({ event }) => worldScreen
          ? event.id === (data.events.find(item => item.id === selectedWorldId)?.id ?? data.events.find(item => item.id === "datos")?.id ?? data.events[0]?.id)
          : !selectedWorldId || event.id === selectedWorldId).map(({ event, people }) => {
          const current = data.submissions.filter(s => s.team_id === view.team.id && s.event_id === event.id && s.current);
          const challenge = data.challenges.find(c => c.event_id === event.id);
          const challengeRubric = challenge?.rubric_id ? data.rubrics.find(r => r.id === challenge.rubric_id) : undefined;
          const challengeCriteria = challengeRubric ? data.criteria.filter(item => item.rubric_id === challengeRubric.id) : [];
          const canManage = !staff && view.team.captain_id === user.id && view.team.captain_active;
          return <details key={event.id} className="management-card" open={!staff || worldScreen}>
            <summary>{event.name} · {event.closed ? "Cerrado" : "Abierto"}</summary>
            {show("all", "worlds", "missions") ? <ul>{people.map(p => <li key={p.id}>
              {p.first_name} {p.last_name} · {p.original ? "Original" : "Sustituto"} · Luma: {p.luma ? "Validado" : "Pendiente"} · Asistencia: {p.present ? "Sí" : "No"} · Al final: {p.at_end ? "Sí" : "No"}
              {staff && !event.closed ? <ManagementForm action="attendance" values={{ teamId: view.team.id, eventId: event.id, userId: p.id }} label="Guardar comprobaciones">
                <p>Correo para comprobar manualmente en Luma: {p.email}</p>
                <label className="management-check"><input name="luma" type="checkbox" defaultChecked={p.luma} />Registro Luma comprobado</label>
                <label className="management-check"><input name="present" type="checkbox" defaultChecked={p.present} />Está presente</label>
                <label className="management-check"><input name="atEnd" type="checkbox" defaultChecked={p.at_end} />Está al final del evento</label>
                <Reason />
              </ManagementForm> : null}
            </li>)}</ul> : null}
            {show("all", "worlds", "missions") && (staff || canManage) && !event.closed ? <>
              <ManagementForm action="invite-substitute" values={{ teamId: view.team.id, eventId: event.id }} label="Invitar sustituto para este mundo">
                <label>Original ausente<select name="originalId" required>{view.originals.filter(p => p.active && p.original).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select></label>
                <label>Correo Luma del sustituto<input type="email" name="email" required /></label>
                <p>El sustituto debe registrarse y aceptar personalmente; también puede hacerlo en el acceso al evento.</p>
              </ManagementForm>
              <ManagementForm action="cancel-substitute" values={{ teamId: view.team.id, eventId: event.id }} label="Cancelar sustitución o invitación de este mundo"><Reason /></ManagementForm>
            </> : null}
            {show("all", "worlds", "missions") ? challenge ? <section><h4>{challenge.title} · v{challenge.version}</h4><p className="management-text">{challenge.instructions}</p>
              {challenge.description ? <p>{challenge.description}</p> : null}
              {challenge.objective ? <p><strong>Objetivo:</strong> {challenge.objective}</p> : null}
              {challenge.requirements.length ? <><h5>Requisitos</h5><ul>{challenge.requirements.map((item, index) => <li key={index}>{item}</li>)}</ul></> : null}
              {challenge.resources.length ? <><h5>Recursos</h5><ul>{challenge.resources.map((item, index) => <li key={index}>{item}</li>)}</ul></> : null}
              {challenge.rules.length ? <><h5>Reglas</h5><ul>{challenge.rules.map((item, index) => <li key={index}>{item}</li>)}</ul></> : null}
              {challenge.deliverables.length ? <><h5>Entregables</h5><ul>{challenge.deliverables.map((item, index) => <li key={index}>{item}</li>)}</ul></> : null}
              <p>{challenge.opens_at ? `Apertura: ${new Date(challenge.opens_at).toLocaleString("es-ES", { timeZone: challenge.timezone || "Europe/Madrid" })} · ` : ""}
                {challenge.deadline ? `Deadline: ${new Date(challenge.deadline).toLocaleString("es-ES", { timeZone: challenge.timezone || "Europe/Madrid" })}` : "Sin deadline acordado"} · {challenge.status}</p>
              {challenge.max_score ? <p>Puntuación máxima: {challenge.max_score}</p> : null}
              {challengeRubric ? <section><h5>Rúbrica v{challengeRubric.version} · máximo {challengeRubric.max_score}</h5>
                <ol>{challengeCriteria.map(item => <li key={item.id}>{item.name} · máximo {item.max_points}{item.description ? ` · ${item.description}` : ""}</li>)}</ol>
              </section> : null}
            </section> : <p>Reto todavía no publicado.</p> : null}
            {show("all", "deliveries", "evaluations", "missions") ? current.map(s => <section key={s.id}><h4>{s.kind === "photo" ? "Foto" : "Entrega del reto"}</h4>
              <a href={s.url} target="_blank" rel="noopener noreferrer">{s.commit_sha ? "Ver el commit entregado en GitHub (privado)" : "Ver evidencia"}</a>
              {s.commit_sha ? <><p className="management-text">MISIÓN ENTREGADA · SHA: {s.commit_sha} · Rama: {s.branch} · Repositorio: {s.github_full_name}</p>
                {staff ? <><a href={`/api/github/snapshot/${s.id}`}>Descargar snapshot privado del SHA para evaluar</a><p>Evalúa esta versión exacta, no la rama actual. En GitHub: clona el repositorio privado con credenciales propias autorizadas y ejecuta <code>git checkout {s.commit_sha}</code>. El snapshot permite recuperar los archivos aunque el capitán borre el commit.</p></> : null}
              </> : null}
              <p>{s.status} · {s.reason ?? "Pendiente de revisión"} · {new Date(s.submitted_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</p>
              {show("all", "deliveries") && staff && !event.evaluation_closed && (s.commit_sha || !event.closed) ? <ManagementForm action="review-evidence" values={{ id: s.id }} label="Guardar revisión">
                <label>Resultado<select name="status" required><option value="approved">Aprobar</option><option value="correction">Pedir corrección</option><option value="rejected">Rechazar</option></select></label><Reason />
              </ManagementForm> : null}
              {show("all", "evaluations") && staff && s.commit_sha && s.status === "approved" && s.rubric_id && !event.evaluation_closed ? (() => {
                const rubric = data.rubrics.find(item => item.id === s.rubric_id);
                const criteria = data.criteria.filter(item => item.rubric_id === s.rubric_id);
                const evaluation = data.evaluations.find(item => item.submission_id === s.id);
                const scores = evaluation ? data.evaluationScores.filter(item => item.evaluation_id === evaluation.id) : [];
                if (!rubric) return <p role="alert">No se encuentra la versión de rúbrica vinculada al SHA.</p>;
                return <section>
                  <h4>Evaluación SHA {s.commit_sha} · Rúbrica v{rubric.version}</h4>
                  {evaluation?.status === "final" ? <p>Evaluación final: {evaluation.final_score}/{rubric.max_score}. Para corregirla, reabre la evaluación del mundo y registra un motivo.</p> : null}
                  <ManagementForm action="save-evaluation" values={{ submissionId: s.id }} label={evaluation?.status === "final" ? "Crear revisión de evaluación" : "Guardar evaluación en revisión"}>
                    {evaluation?.status === "final" ? <Reason /> : null}
                    {criteria.map(criterion => {
                      const score = scores.find(item => item.criterion_id === criterion.id);
                      return <fieldset key={criterion.id}>
                        <legend>{criterion.name} · máximo {criterion.max_points}</legend>
                        {criterion.description ? <p>{criterion.description}</p> : null}
                        <label>Puntuación<input name={`criterionScore_${criterion.id}`} type="number" min="0" max={criterion.max_points} step="1" defaultValue={score?.score ?? 0} required /></label>
                        <label>Comentario<textarea name={`criterionComment_${criterion.id}`} maxLength={1000} defaultValue={score?.comment ?? ""} /></label>
                      </fieldset>;
                    })}
                    <label>Feedback privado<textarea name="feedbackPrivate" maxLength={4000} defaultValue={evaluation?.feedback_private ?? ""} /></label>
                    <label>Feedback público<textarea name="feedbackPublic" maxLength={4000} defaultValue={evaluation?.feedback_public ?? ""} /></label>
                  </ManagementForm>
                  {evaluation?.status === "in_review" ? <ManagementForm action="finalize-evaluation" values={{ id: evaluation.id }} label="Finalizar y bloquear evaluación" /> : null}
                </section>;
              })() : null}
            </section>) : null}
            {canManage && !event.closed && !event.evaluation_closed ? (["challenge", "photo"] as const).map(kind => {
              const previous = current.find(s => s.kind === kind);
              if (kind === "challenge") return <MissionDelivery key={kind} teamId={view.team.id} eventId={event.id} previousId={previous?.id} />;
              return <ManagementForm key={kind} action="submit-evidence" values={{ teamId: view.team.id, eventId: event.id, kind, ...(previous ? { previousId: previous.id } : {}) }} label={kind === "photo" ? "Enviar foto a revisión" : "Entregar reto"}>
                <label>{kind === "photo" ? "Enlace a foto etiquetando comunidades y sponsors" : "Enlace de la entrega"}<input name="url" type="url" maxLength={2000} required /></label>
                {previous ? <p>Reenviar crea una versión nueva y una nueva fecha para el bonus; la anterior queda en el historial.</p> : null}
              </ManagementForm>;
            }) : null}
            {show("all", "points", "missions") ? <>
              <h4>Desglose de puntos validados</h4>
              <ul>{data.movements.filter(m => m.team_id === view.team.id && m.event_id === event.id).map(m => <li key={m.concept}>{({ attendance: "Asistencia", photo: "Foto", challenge: "Reto", bonus: "Bonus" } as Record<string, string>)[m.concept]}: {m.points}</li>)}</ul>
            </> : null}
          </details>;
        })}
        {!staff && view.team.captain_id === user.id && view.team.captain_active ? <ManagementForm action="request-captain" values={{ teamId: view.team.id }} label="Solicitar cambio de capitán">
          <label>Nuevo capitán<select name="nextId" required>{view.originals.filter(p => p.active && p.original && p.id !== user.id).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select></label><Reason />
        </ManagementForm> : null}
        {staff && isAdmin ? <ManagementForm action="replace-member" values={{ teamId: view.team.id }} label="Aprobar relevo por fuerza mayor">
          <label>Integrante que causa baja<select name="previousId" required>{view.originals.filter(p => p.active).map(p => <option value={p.id} key={p.id}>{p.first_name} {p.last_name}</option>)}</select></label>
          <label>Cuenta verificada de relevo<select name="nextId" required>{participantOptions}</select></label><Reason />
          <p>El relevo no se convierte en original ni concede continuidad ficticia. No puede seguir activo en otro equipo.</p>
        </ManagementForm> : null}
      </details>)}
    </details> : null}
    {isAdmin && show("all", "teams") ? <details className="management-section"><summary>Cambios de capitán</summary><ul>{data.changes.map(c => <li key={c.id}>{c.reason} · {c.status} · {c.review_reason}
      {staff && c.status === "pending" ? <ManagementForm action="review-captain" values={{ id: c.id }} label="Resolver cambio">
        <label>Decisión<select name="status"><option value="approved">Aprobar y enviar activación</option><option value="rejected">Rechazar</option></select></label><Reason />
      </ManagementForm> : null}
    </li>)}</ul></details> : null}
    {staff ? <>
      {show("all", "challenges", "evaluations") ? <details id="gestion-retos" className="management-section" open={section === "challenges" || section === "evaluations"}><summary>Retos y rúbricas</summary>
        {data.events.map(event => {
          const eventRubrics = data.rubrics.filter(r => r.event_id === event.id);
          const draftRubric = eventRubrics.find(r => r.status === "draft");
          const publishedRubric = eventRubrics.find(r => r.status === "published");
          const lockedRubric = eventRubrics.find(r => r.status === "locked");
          const rubricForDraft = draftRubric ?? publishedRubric ?? lockedRubric;
          const rubricCriteria = rubricForDraft ? data.criteria.filter(item => item.rubric_id === rubricForDraft.id) : [];
          return <details className="management-card" key={event.id} open={section === "challenges" || section === "evaluations"}><summary>{event.name}</summary>
            {!event.evaluation_closed && show("all", "evaluations") ? <>
              <h4>Rúbrica versionada</h4>
              <p>La suma de los máximos por criterio debe coincidir con la puntuación máxima. Publicar congela esta versión; los SHA entregados conservan su rúbrica.</p>
              <ManagementForm action="save-rubric" values={{ eventId: event.id }} label="Guardar nueva versión de rúbrica">
                <label>Puntuación máxima<input name="maxScore" type="number" min="1" defaultValue={rubricForDraft?.max_score ?? ""} required /></label>
                <label>Criterios JSON<textarea name="criteria" rows={8} maxLength={12000} defaultValue={JSON.stringify(rubricCriteria.map(item => ({
                  name: item.name, description: item.description, maxPoints: item.max_points,
                })), null, 2)} placeholder={'[{"name":"Criterio","description":"Qué se evalúa","maxPoints":10}]'} required /></label>
              </ManagementForm>
              {eventRubrics.filter(r => r.status === "draft").map(rubric => <section key={rubric.id}>
                <p>Borrador v{rubric.version} · máximo {rubric.max_score}</p>
                <ManagementForm action="publish-rubric" values={{ id: rubric.id }} label="Publicar rúbrica" />
              </section>)}
              {publishedRubric ? <p>Rúbrica publicada v{publishedRubric.version} · máximo {publishedRubric.max_score}</p>
                : lockedRubric ? <p>Rúbrica bloqueada v{lockedRubric.version} · máximo {lockedRubric.max_score}</p>
                  : <p role="status">Publica una rúbrica antes de abrir el reto.</p>}
            </> : null}
            {show("all", "evaluations") ? <>
              <p>Evaluación: {event.evaluation_closed ? "Cerrada" : "Pendiente / en curso"}. Las misiones se evalúan tras el deadline y permanecen privadas.</p>
              {!event.evaluation_closed ? <ManagementForm action="close-evaluation" values={{ eventId: event.id }} label="Cerrar evaluación de este mundo"><Reason /></ManagementForm> : null}
            </> : null}
          </details>;
        })}
      </details> : null}
      {show("all", "deliveries") ? <details className="management-section" open={section === "deliveries"}><summary>Publicar soluciones seleccionadas · Top 3 por mundo</summary>
        <p>Solo después de cerrar la evaluación y publicar el ranking. Selecciona una carpeta del SHA definitivo, descarga el snapshot y revisa su contenido y derechos. La autorización crea una rama pública y un PR borrador en el repositorio oficial; nunca hace público el repositorio del equipo ni integra automáticamente el PR.</p>
        <ManagementForm action="prepare-solution" label="Preparar manifiesto privado de publicación">
          <label>Entrega GitHub definitiva<select name="submissionId" required>{data.submissions.filter(s => s.commit_sha && s.current && s.status === "approved").map(s => <option key={s.id} value={s.id}>{s.event_id} · {data.views.find(v => v.team.id === s.team_id)?.team.name} · {s.commit_sha}</option>)}</select></label>
          <label>Carpeta dentro del SHA<input name="folder" maxLength={500} placeholder="world-01-architecture" required /></label><Reason />
        </ManagementForm>
        {github.jobs.map(job => <details className="management-card" key={job.id}><summary>{job.event_id} · Top {job.position} · {job.status}</summary>
          <p>Carpeta: {job.source_folder} · Autorización: {job.reason}</p>
          {job.submission_id ? <a href={`/api/github/snapshot/${job.submission_id}`}>Descargar snapshot privado para revisar los archivos</a> : null}
          <ul>{job.manifest.map(f => <li key={f.path}>{f.path} · {f.bytes} bytes · SHA256 {f.digest}</li>)}</ul>
          {job.error ? <p role="alert">{job.error}</p> : null}
          {["prepared", "failed"].includes(job.status) ? <ManagementForm action="publish-solution" values={{ id: job.id, manifestDigest: job.manifest_digest }} label="Autorizar publicación y crear PR borrador">
            <label className="management-check"><input type="checkbox" name="confirmed" required />He revisado todos los archivos del manifiesto, no contienen secretos ni datos personales y tenemos derechos para publicarlos.</label><Reason />
          </ManagementForm> : null}
          {job.status === "prepared" ? <ManagementForm action="cancel-solution" values={{ id: job.id }} label="Cancelar preparación"><Reason /></ManagementForm> : null}
          {job.status === "creating" ? <ManagementForm action="recover-solution" values={{ id: job.id }} label="Recuperar trabajo si lleva 15 minutos interrumpido" /> : null}
          {job.pr_url ? <a href={job.pr_url} target="_blank" rel="noopener noreferrer">Revisar PR en el repositorio oficial</a> : null}
          {job.pr_number ? <ManagementForm action="sync-solution" values={{ id: job.id }} label="Comprobar integración del PR" /> : null}
        </details>)}
      </details> : null}
      {show("all", "points") ? <details className="management-section" open={section === "points"}><summary>Revisión y publicación de resultados</summary>
        <p>Publica primero los mundos y después la global. Una corrección retira la publicación afectada hasta revisarla de nuevo. Las posiciones nunca se deciden automáticamente si hay empate.</p>
        {data.previews.filter(({ event }) => !selectedWorldId || event.id === selectedWorldId).map(({ event, preview }) => <details key={event.id}><summary>{event.name}</summary>
          {preview.bonus.pending ? <RankingReview scope={`bonus:${event.id}`} preview={preview.bonus} /> : null}
          <RankingReview scope={event.id} preview={preview} />
        </details>)}
        {isAdmin && data.global && !selectedWorldId ? <RankingReview scope="global" preview={data.global} /> : null}
      </details> : null}

      {isAdmin && show("all", "community") ? <details className="management-section" open={section === "community"}><summary>Comunidades y bajas</summary>
        <ul>{data.communities.map(c => <li key={c.name}>{c.name} · {c.active ? "Activa" : "Baja oficial"}</li>)}</ul>
        <ManagementForm action="community-state" label="Guardar estado oficial de comunidad">
          <label>Comunidad<input name="name" maxLength={120} required /></label><label className="management-check"><input name="active" type="checkbox" defaultChecked />Comunidad activa</label><Reason />
        </ManagementForm>
        <ManagementForm action="staff-community" label="Vincular staff aprobado a otra comunidad">
          <label>Staff<select name="userId">{accountOptions}</select></label><label>Comunidad activa<input name="name" maxLength={120} required /></label>
        </ManagementForm>
        {data.withdrawals.map(w => <ManagementForm key={w.id} action="review-withdrawal" values={{ id: w.id }} label="Resolver solicitud de baja">
          <p>{data.accounts.find(a => a.id === w.user_id)?.email ?? w.user_id}: {w.reason}</p>
          <label>Decisión<select name="status"><option value="completed">Completar baja y anonimizar</option><option value="rejected">No completar (explicar motivo)</option></select></label><Reason />
        </ManagementForm>)}
      </details> : null}
      {isAdmin && show("all", "community") ? <details className="management-section" open={section === "community"}><summary>Colaboradores, aportaciones y recursos</summary>
        <p>No se comparten datos de participantes con sponsors. Solo se publica el recurso si hay autorización explícita.</p>
        {[null, ...data.contributions].map(c => <ManagementForm key={c?.id ?? "new"} action="save-contribution" values={c ? { id: c.id } : {}} label={c ? "Actualizar aportación" : "Añadir aportación"}>
          <label>Colaborador<input name="name" maxLength={200} defaultValue={c?.name} required /></label>
          <label>Aportación<textarea name="description" maxLength={1000} defaultValue={c?.description} required /></label>
          <label>Destino<textarea name="destination" maxLength={1000} defaultValue={c?.destination} required /></label>
          <label>Importe (céntimos; 0 para especie)<input name="amountCents" type="number" min="0" step="1" defaultValue={c?.amount_cents ?? 0} required /></label>
          <label>Recurso o memoria (HTTPS, opcional)<input name="url" type="url" defaultValue={c?.resource_url ?? ""} /></label>
          <label className="management-check"><input name="authorized" type="checkbox" defaultChecked={c?.authorized} />Publicación del recurso autorizada</label>
        </ManagementForm>)}
      </details> : null}
      {isAdmin && show("all", "community") ? <details className="management-section"><summary>Auditoría de las últimas 100 operaciones</summary><ul>{data.audits.map(a => <li key={a.id}>{new Date(a.created_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })} · {a.action}<pre className="management-text">{JSON.stringify(a.details)}</pre></li>)}</ul></details> : null}
    </> : <section><h2>Historial de entregas</h2><ul>{data.submissions.map(s => <li key={s.id}>{s.event_id} · {s.kind} · {s.status} · {s.current ? "Actual" : "Versión anterior"} · {new Date(s.submitted_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</li>)}</ul></section>}
  </>;
}
