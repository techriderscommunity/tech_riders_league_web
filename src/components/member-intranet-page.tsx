import Link from "next/link";
import { IntranetShell } from "./intranet-shell";
import { ManagementForm } from "./management-form";
import { OperationsPanel } from "./operations-panel";
import { TeamLogoForm } from "./team-logo-form";
import styles from "./intranet-shell.module.css";
import { dashboard, type User } from "../lib/management/service";
import { publishedResults } from "../lib/management/operations";

export type MemberScreen = "adventure" | "team" | "missions" | "rankings" | "profile" | "resources";

const screens: Record<MemberScreen, { title: string; description: string }> = {
  adventure: { title: "Mi aventura", description: "Tu equipo y el progreso de tu temporada, en un solo lugar." },
  team: { title: "Mi equipo", description: "Gestiona tu plantilla, invitaciones y estado de validación." },
  missions: { title: "Mis misiones", description: "Consulta los mundos, retos y entregas de tu equipo." },
  rankings: { title: "Rankings", description: "Clasificaciones publicadas y puntos validados de la temporada." },
  profile: { title: "Mi perfil", description: "Tu identidad, tu equipo y el progreso de tu temporada." },
  resources: { title: "Recursos", description: "Materiales y referencias para avanzar en la aventura." },
};

const profileStages = [
  { id: "negocio", code: "M1", name: "Negocio" },
  { id: "datos", code: "M2", name: "Datos" },
  { id: "cloud", code: "M3", name: "Cloud" },
  { id: "seguridad", code: "M4", name: "Seguridad" },
  { id: "hackathon", code: "M5", name: "Final" },
] as const;

const rankingWorlds = [
  { id: "negocio", code: "M1", title: "Negocio & Arquitectura", image: "I" },
  { id: "datos", code: "M2", title: "Datos", image: "II" },
  { id: "cloud", code: "M3", title: "Cloud", image: "III" },
  { id: "seguridad", code: "M4", title: "Seguridad", image: "IV" },
  { id: "hackathon", code: "M5", title: "Hackathon", image: "Final" },
] as const;

function profileInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase("es") ?? "").join("");
}

function profileDate(date: Date) {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export async function MemberIntranetPage({ user, screen, invitationToken, githubStatus, selectedWorldId }: {
  user: User;
  screen: MemberScreen;
  invitationToken?: string;
  githubStatus?: string;
  selectedWorldId?: string;
}) {
  const data = await dashboard(user);
  const staffAccount = user.is_owner || user.is_league_admin || ["pending", "approved"].includes(user.staff_status);
  const staffAccess = user.is_owner || user.is_league_admin || user.staff_status === "approved";
  const role = user.is_owner || user.is_league_admin ? "Admin League"
    : user.staff_status === "approved" ? "Staff"
      : user.staff_status === "pending" ? "Staff pendiente"
        : data.team?.is_captain ? "Capitán" : "Participante";
  const teamStatus = data.team ? ({
    draft: "Borrador",
    pending: "En revisión",
    correction: "Requiere correcciones",
    approved: "Aprobado",
    rejected: "Rechazado",
  } as Record<string, string>)[data.team.status] ?? data.team.status : "";
  const screenInfo = screens[screen];
  const active = staffAccess ? screen === "profile" ? "account" : screen : screen;
  const metrics = screen === "adventure" ? data.team ? [
    { label: "Integrantes", value: String(data.members.filter(member => member.active).length) },
    { label: "Estado del equipo", value: teamStatus },
    { label: "Invitaciones pendientes", value: String(data.invitations.filter(invitation => invitation.status === "pending").length) },
  ] : [
    { label: "Equipo", value: "Sin equipo" },
    { label: "Cuenta", value: user.verified_at ? "Verificada" : "Pendiente" },
  ] : [];
  const shellProps = {
    active,
    title: data.retired ? "Temporada archivada" : screenInfo.title,
    description: data.retired ? "La temporada ha concluido y los datos personales de participación se han retirado." : screenInfo.description,
    headingEyebrow: screen === "profile" ? "" : undefined,
    hideTopbar: screen === "profile",
    userName: `${user.first_name} ${user.last_name}`,
    role,
    metrics,
    staff: staffAccess,
    admin: Boolean(user.is_owner || user.is_league_admin),
  };

  if (data.retired) return <IntranetShell {...shellProps}>
    <article className="page-content management-page">
      <p>Se han retirado los datos de participación de esta campaña. El ranking se conserva anonimizado.</p>
      {staffAccess ? <Link className="button-link" href="/gestion">Gestión</Link> : null}
      <ManagementForm action="logout" label="Cerrar sesión" />
    </article>
  </IntranetShell>;

  if (screen === "adventure") return <IntranetShell {...shellProps}>
    <div className={styles.screenGrid}>
      {githubStatus === "error" ? <p role="alert">No se pudo vincular GitHub. Comprueba que sigues siendo el capitán activo y vuelve a intentarlo.</p> : null}
      {githubStatus === "linked" ? <p role="status">GitHub vinculado. Conecta tu repositorio privado si aún no lo has asociado.</p> : null}
      <section className={styles.featureCard}>
        <div>
          <p className={styles.featureLabel}>{data.team ? "TU EQUIPO" : "EMPIEZA AQUÍ"}</p>
          <h2>{data.team?.name ?? "Prepara tu aventura"}</h2>
          <p>{data.team ? `Estado: ${teamStatus}. Ya puedes consultar tus misiones y el progreso de la temporada.` : "Crea tu equipo o acepta una invitación para comenzar."}</p>
          <Link className="button-link" href={data.team ? "/mi-equipo/equipo" : "/mi-equipo/equipo"}>{data.team ? "Ver mi equipo" : "Crear equipo"}</Link>
        </div>
        <img src="/images/Mapa League.png" alt="" />
      </section>
      <Link className={`${styles.screenCard} ${styles.screenCardLink}`} href="/mi-equipo/misiones">
        <p className={styles.featureLabel}>TEMPORADA 2027</p>
        <h2>Mis misiones</h2>
        <p>Abre cada mundo para consultar retos, entregas y el progreso de tu equipo.</p>
      </Link>
      <Link className={`${styles.screenCard} ${styles.screenCardLink}`} href="/mi-equipo/rankings">
        <p className={styles.featureLabel}>CLASIFICACIÓN</p>
        <h2>Rankings y puntos</h2>
        <p>Consulta los resultados que ya se han revisado y publicado.</p>
      </Link>
      {data.team ? <section className={styles.screenCard}>
        <h2>Tu plantilla</h2>
        <ul>{data.members.filter(member => member.active).map(member =>
          <li key={member.id}>{member.first_name} {member.last_name}{member.id === data.team?.captain_id ? " · Capitán" : ""}</li>)}</ul>
      </section> : <section className={styles.screenCard}>
        <h2>¿Te han invitado?</h2>
        <p>Accede con el correo que recibió la invitación y ábrela desde el enlace del mensaje.</p>
        <Link href="/acceso">Ir a mi cuenta</Link>
      </section>}
      <Link className={`${styles.screenCard} ${styles.screenCardLink}`} href="/mi-equipo/recursos">
        <p className={styles.featureLabel}>APRENDE Y CONSTRUYE</p>
        <h2>Recursos de la League</h2>
        <p>Guías, memoria y referencias para tu aventura.</p>
      </Link>
    </div>
  </IntranetShell>;

  if (screen === "team") {
    if (!data.team) return <IntranetShell {...shellProps}>
      <div className={styles.teamSetup}>
        {invitationToken ? <section className={styles.teamPanel}>
          <h2>Aceptar invitación</h2>
          <p>Se verificará que la invitación está dirigida a tu correo.</p>
          <ManagementForm action="accept" values={{ token: invitationToken }} label="Aceptar incorporación al equipo" />
        </section> : null}
        <section className={styles.teamPanel}>
          <p className={styles.featureLabel}>EMPIEZA TU AVENTURA</p>
          <h2>Forma tu equipo</h2>
          <p>Los equipos tienen entre {data.rules.min_team_size} y {data.rules.max_team_size} integrantes. Si te han invitado, utiliza el enlace de tu correo.</p>
          <ManagementForm action="create-team" label="Crear equipo">
            <label>Nombre único del equipo<input name="name" maxLength={60} required /></label>
          </ManagementForm>
        </section>
      </div>
    </IntranetShell>;

    const results = await publishedResults();
    const globalRank = results.rankings.global?.find(item => item.id === data.team?.id);
    const activeMembers = data.members.filter(member => member.active);
    const teamActivity = [
      ...(data.team.created_at ? [{ label: "Se creó el equipo", detail: data.team.name, date: data.team.created_at }] : []),
      ...activeMembers.flatMap(member => member.joined_at
        ? [{ label: `${member.first_name} ${member.last_name} se unió al equipo`, detail: member.id === data.team?.captain_id ? "Capitán" : "Miembro", date: member.joined_at }]
        : []),
    ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);
    const teamControls = data.team.is_captain && data.team.captain_active;

    return <IntranetShell {...shellProps}>
      <div className={styles.teamDashboard}>
        <section className={styles.teamHero}>
          <div className={styles.teamIdentity}>
            {data.team.logo_asset_id
              ? <img className={styles.teamLogo} src={`/api/equipos/${data.team.id}/logo`} alt={`Logo de ${data.team.name}`} />
              : <span className={styles.teamLogoFallback} aria-hidden="true">{profileInitials(data.team.name)}</span>}
            <div>
              <p className={styles.featureLabel}>EQUIPO DE LA LEAGUE</p>
              <h2>{data.team.name}</h2>
              <span className={styles.statusBadge}>{teamStatus}</span>
              {data.team.review_reason ? <p role="status">{data.team.review_reason}</p> : null}
            </div>
          </div>
          <div className={styles.teamHeroRank}>
            <strong>{globalRank ? `#${globalRank.posicion}` : "—"}</strong>
            <span>Ranking global</span>
            <strong>{globalRank ? `${globalRank.puntos.toLocaleString("es-ES")} XP` : "—"}</strong>
          </div>
        </section>

        <section className={styles.teamPanel}>
          <header className={styles.teamSectionHeader}>
            <div><h2>Miembros del equipo ({activeMembers.length})</h2><p>Plantilla activa: máximo {data.rules.max_team_size} integrantes.</p></div>
            {teamControls && ["draft", "correction"].includes(data.team.status)
              ? <a className="button-link" href="#gestionar-equipo">Invitar miembro</a>
              : null}
          </header>
          <ul className={styles.teamMemberGrid}>
            {activeMembers.map(member => <li key={member.id} aria-current={member.id === user.id ? "true" : undefined}>
              {member.id === data.team?.captain_id ? <span className={styles.teamCrown} aria-label="Capitán">★</span> : null}
              <span className={styles.teamMemberAvatar} aria-hidden="true">{profileInitials(`${member.first_name} ${member.last_name}`)}</span>
              <strong>{member.first_name} {member.last_name}</strong>
              <small>{member.id === data.team?.captain_id ? "Capitán" : "Miembro"}</small>
            </li>)}
          </ul>
          {data.members.some(member => !member.active) ? <p className={styles.teamInactiveNotice}>También hay integrantes inactivos en el historial del equipo.</p> : null}
        </section>

        <section className={styles.teamPanel}>
          <h2>Estadísticas del equipo</h2>
          <div className={styles.teamStats}>
            <article><strong>{activeMembers.length}</strong><span>Miembros</span></article>
            <article><strong>{globalRank?.puntos.toLocaleString("es-ES") ?? (results.configured ? "0" : "—")}</strong><span>Puntos publicados</span></article>
            <article><strong>{globalRank ? `#${globalRank.posicion}` : "—"}</strong><span>Ranking global</span></article>
            <article><strong>{results.configured ? `${profileStages.filter(stage => results.rankings[stage.id]?.some(item => item.id === data.team?.id)).length} / ${profileStages.length}` : "—"}</strong><span>Mundos con puntos</span></article>
          </div>
        </section>

        <section className={styles.teamPanel}>
          <h2>Actividad reciente</h2>
          {teamActivity.length ? <ol className={styles.teamActivity}>
            {teamActivity.map((item, index) => <li key={`${item.label}-${index}`}>
              <span className={styles.teamActivityIcon} aria-hidden="true">{index === 0 ? "↗" : "●"}</span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              <time dateTime={item.date.toISOString()}>{profileDate(item.date)}</time>
            </li>)}
          </ol> : <p>Aún no hay actividad registrada.</p>}
        </section>
      </div>

      <section id="gestionar-equipo" className={`page-content management-page ${styles.teamManagement}`}>
        <h2>Gestión del equipo</h2>
        {data.team.created_at ? <p>Equipo creado el {profileDate(data.team.created_at)}.</p> : null}
        {teamControls ? <TeamLogoForm teamId={data.team.id} /> : null}
        {teamControls && ["draft", "correction"].includes(data.team.status) ? <>
          <p>El nombre del equipo queda fijado al crearlo.</p>
          <ManagementForm action="invite" values={{ teamId: data.team.id }} label="Invitar integrante">
            <label>Correo del compañero (igual que en Luma)<input name="email" type="email" required /></label>
          </ManagementForm>
          <ManagementForm action="submit-team" values={{ teamId: data.team.id }} label="Enviar equipo a validación" />
        </> : null}
        {data.invitations.length ? <>
          <h3>Invitaciones</h3>
          <ul>{data.invitations.map(invitation => <li key={invitation.id}>
            {invitation.email} · {invitation.status} · Caduca {new Date(invitation.expires_at).toLocaleDateString("es")}
            {invitation.status === "pending" && teamControls && ["draft", "correction"].includes(data.team?.status ?? "")
              ? <ManagementForm action="cancel-invitation" values={{ teamId: data.team?.id, invitationId: invitation.id }} label="Cancelar invitación" />
              : null}
          </li>)}</ul>
        </> : null}
        {data.members.some(member => !member.active) ? <>
          <h3>Historial de integrantes</h3>
          <ul>{data.members.filter(member => !member.active).map(member => <li key={member.id}>
            {member.first_name} {member.last_name}
            {member.id === data.team?.captain_id ? member.active ? " · Capitán" : " · Capitán pendiente de activación" : ""}
            {" · Baja lógica"}
          </li>)}</ul>
        </> : null}
        {teamControls ? <ManagementForm action="request-captain" values={{ teamId: data.team.id }} label="Solicitar cambio de capitán">
          <label>Nuevo capitán<select name="nextId" required>{data.members.filter(member => member.active && member.original && member.id !== user.id).map(member =>
            <option key={member.id} value={member.id}>{member.first_name} {member.last_name}</option>)}</select></label>
          <label>Motivo<textarea name="reason" maxLength={1000} required /></label>
        </ManagementForm> : null}
      </section>
    </IntranetShell>;
  }

  if (screen === "missions") return <IntranetShell {...shellProps}>
    {data.team?.status === "approved" ? <OperationsPanel user={user} teamId={data.team.id} section="missions" selectedWorldId={selectedWorldId} />
      : <section className="management-card"><h2>Misiones aún no disponibles</h2><p>Cuando tu equipo esté aprobado podrás consultar sus mundos y entregar los retos.</p><Link href="/mi-equipo/equipo">Ver mi equipo</Link></section>}
  </IntranetShell>;

  if (screen === "rankings") {
    const results = await publishedResults();
    const worldRankings = rankingWorlds.map(world => ({
      ...world,
      teams: results.rankings[world.id] ?? [],
    }));
    const globalRanking = results.rankings.global ?? [];
    return <IntranetShell {...shellProps}>
      {!results.configured ? <section className="management-card"><h2>Clasificación pendiente</h2><p>Los rankings estarán disponibles cuando la organización publique resultados revisados.</p></section>
        : <div className={styles.rankingsDashboard}>
          <nav className={styles.rankingsTabs} aria-label="Vistas del ranking">
            <a href="#rankings-mundos" aria-current="page">Rankings por mundo</a>
            <a href="#clasificacion-global">Clasificación global</a>
          </nav>
          {worldRankings.some(world => world.teams.length) ? <div id="rankings-mundos" className={styles.rankingWorldGrid}>
            {worldRankings.map(world => <section key={world.id} className={styles.rankingWorldCard}>
              <div className={styles.rankingWorldArt}>
                <img src={`/images/Tech%20Riders%20League%20${world.image}.png`} alt="" />
                <span>{world.code}</span>
              </div>
              <h2>{world.title}</h2>
              {world.teams.length ? <ol className={styles.rankingPodium}>
                {world.teams.slice(0, 3).map(team => <li key={team.id} data-current-team={team.id === data.team?.id}>
                  <span className={styles.rankingMedal}>{team.posicion}</span>
                  <span><strong>{team.equipo}</strong><small>{team.puntos.toLocaleString("es-ES")} XP</small></span>
                </li>)}
              </ol> : <p>Aún no se ha publicado este mundo.</p>}
              {world.teams.length > 3 ? <details className={styles.rankingMore}>
                <summary>Ver clasificación completa ({world.teams.length} equipos)</summary>
                <ol start={4}>{world.teams.slice(3).map(team => <li key={team.id}>{team.equipo} · {team.puntos.toLocaleString("es-ES")} XP</li>)}</ol>
              </details> : null}
            </section>)}
          </div> : <section id="rankings-mundos" className={styles.rankingEmpty}><h2>Aún no hay rankings publicados</h2><p>Los resultados aparecerán aquí cuando se complete su revisión.</p></section>}
          <section id="clasificacion-global" className={styles.globalRanking}>
            <header><div><h2>Clasificación global</h2><p>Suma de puntos publicados en los mundos.</p></div><span>{globalRanking.length} equipos</span></header>
            {globalRanking.length ? <div className={styles.rankingTableWrap}>
              <table className={styles.rankingTable}>
                <thead><tr><th scope="col">#</th><th scope="col">Equipo</th>{rankingWorlds.map(world => <th scope="col" key={world.id}>{world.code}</th>)}<th scope="col">Total</th></tr></thead>
                <tbody>{globalRanking.map(team => <tr key={team.id} data-current-team={team.id === data.team?.id}>
                  <th scope="row">{team.posicion}</th><td>{team.equipo}</td>
                  {worldRankings.map(world => <td key={world.id}>{world.teams.find(item => item.id === team.id)?.puntos.toLocaleString("es-ES") ?? "—"}</td>)}
                  <td>{team.puntos.toLocaleString("es-ES")} XP</td>
                </tr>)}</tbody>
              </table>
            </div> : <p>La clasificación global estará disponible después de publicar los resultados de la temporada.</p>}
          </section>
        </div>}
    </IntranetShell>;
  }

  if (screen === "profile") {
    const results = await publishedResults();
    const teamRank = data.team ? results.rankings.global?.find(item => item.id === data.team?.id) : undefined;
    const stages = profileStages.map(stage => ({
      ...stage,
      rank: data.team ? results.rankings[stage.id]?.find(item => item.id === data.team?.id) : undefined,
    }));
    const activeMembers = data.members.filter(member => member.active);
    const ownMembership = data.members.find(member => member.id === user.id);
    const activity = [
      ...(data.team?.is_captain && data.team.created_at
        ? [{ label: "Creaste tu equipo", detail: data.team.name, date: data.team.created_at }]
        : []),
      ...(data.team && !data.team.is_captain && ownMembership?.joined_at
        ? [{ label: "Te uniste al equipo", detail: data.team.name, date: ownMembership.joined_at }]
        : []),
      ...(user.verified_at
        ? [{ label: "Cuenta verificada", detail: "Correo confirmado", date: user.verified_at }]
        : []),
    ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 4);
    const headingAction = <div className={styles.profileHeadingActions}>
      <blockquote className={styles.profileQuote}>«La tecnología es mejor cuando se comparte.»</blockquote>
      <Link className={`${styles.profileEditButton} button-link`} href="#editar-perfil">Editar perfil</Link>
    </div>;
    return <IntranetShell {...shellProps} headingAction={headingAction}>
      <div className={styles.profileDashboard}>
        <section className={`${styles.profilePanel} ${styles.profileIdentity}`}>
          <div className={styles.profilePortraitFrame}>
            <img className={styles.profilePortrait} src="/images/Techito.png" alt="Techito, mascota de Tech Riders League" />
          </div>
          <div className={styles.profileIdentityDetails}>
            <h2>{user.first_name} {user.last_name}</h2>
            <p className={styles.profileEmail}>{user.email}</p>
            <span className={styles.profileRole}>{role}</span>
            <dl className={styles.profileFacts}>
              <div><dt>Cuenta</dt><dd>{user.verified_at ? "Verificada" : "Pendiente de verificación"}</dd></div>
              <div><dt>Equipo</dt><dd>{data.team ? <Link href="/mi-equipo/equipo">{data.team.name}</Link> : "Sin equipo"}</dd></div>
              {data.team ? <div><dt>Estado del equipo</dt><dd>{teamStatus}</dd></div> : null}
            </dl>
          </div>
        </section>

        <section className={`${styles.profilePanel} ${styles.profileProgress}`}>
          <h2>Mi progreso en la League</h2>
          <div className={styles.profileStats}>
            <article><span className={styles.profileStatIcon} aria-hidden="true">XP</span><strong>{teamRank?.puntos.toLocaleString("es-ES") ?? (results.configured ? "0" : "—")}</strong><span>Puntos de equipo</span></article>
            <article><span className={styles.profileStatIcon} aria-hidden="true">▮</span><strong>{teamRank ? `#${teamRank.posicion}` : "—"}</strong><span>Ranking global</span></article>
            <article><span className={styles.profileStatIcon} aria-hidden="true">◈</span><strong>{results.configured ? `${stages.filter(stage => stage.rank).length} / ${stages.length}` : "—"}</strong><span>Etapas con puntos</span></article>
            <article><span className={styles.profileStatIcon} aria-hidden="true">●</span><strong>{data.team ? activeMembers.length : "—"}</strong><span>Integrantes</span></article>
          </div>
          <div className={styles.profileJourney}>
            <h3>Tu viaje en la League</h3>
            <ol className={styles.profileStages}>
              {stages.map(stage => <li key={stage.id} data-published={Boolean(stage.rank)}>
                <span className={styles.profileStageMarker} aria-hidden="true">{stage.rank ? "✓" : "·"}</span>
                <span>{stage.code}</span>
                <small>{stage.name}</small>
              </li>)}
            </ol>
            <p>Solo se reflejan resultados revisados y publicados.</p>
          </div>
        </section>

        <section className={`${styles.profilePanel} ${styles.profileTeam}`}>
          <header className={styles.profileSectionHeader}>
            <h2>Mi equipo</h2>
            <Link href="/mi-equipo/equipo">{data.team ? "Ver equipo →" : "Crear equipo →"}</Link>
          </header>
          {data.team ? <>
            <div className={styles.profileTeamSummary}>
              {data.team.logo_asset_id
                ? <img className={styles.profileTeamLogo} src={`/api/equipos/${data.team.id}/logo`} alt={`Logo de ${data.team.name}`} />
                : <span className={styles.profileTeamLogoFallback} aria-hidden="true">{profileInitials(data.team.name)}</span>}
              <div><h3>{data.team.name}</h3><p>{teamStatus}</p></div>
            </div>
            <ul className={styles.profileRoster}>
              {activeMembers.map(member => <li key={member.id} aria-current={member.id === user.id ? "true" : undefined}>
                <span className={styles.profileMemberAvatar} aria-hidden="true">{profileInitials(`${member.first_name} ${member.last_name}`)}</span>
                <strong>{member.first_name}</strong>
                <small>{member.id === data.team?.captain_id ? "Capitán" : "Miembro"}</small>
              </li>)}
            </ul>
          </> : <p>Aún no formas parte de un equipo. Puedes crear uno o aceptar una invitación.</p>}
        </section>

        <section className={`${styles.profilePanel} ${styles.profileActivity}`}>
          <h2>Actividad reciente</h2>
          {activity.length ? <ol className={styles.profileActivityList}>
            {activity.map((item, index) => <li key={`${item.label}-${index}`}>
              <span className={styles.profileActivityIcon} aria-hidden="true">{index === 0 ? "↗" : "✓"}</span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              <time dateTime={item.date.toISOString()}>{profileDate(item.date)}</time>
            </li>)}
          </ol> : <p>Aún no hay actividad registrada.</p>}
        </section>
      </div>

      <section id="editar-perfil" className={`page-content management-page ${styles.profileEditSection}`}>
        <h2>Datos de la cuenta</h2>
        {staffAccount ? <p><Link className="button-link" href="/gestion">Abrir panel de gestión</Link></p> : null}
        {user.staff_status === "pending" ? <p>Tu solicitud de Staff está pendiente de aprobación.</p> : null}
        <ManagementForm action="update-profile" label="Guardar mis datos">
          <label>Nombre<input name="firstName" maxLength={100} defaultValue={user.first_name} required /></label>
          <label>Apellidos<input name="lastName" maxLength={100} defaultValue={user.last_name} required /></label>
          <label>Correo (el mismo que en Luma)<input type="email" name="email" defaultValue={user.email} required /></label>
          <label>Contraseña actual<input type="password" name="currentPassword" autoComplete="current-password" minLength={12} maxLength={128} required /></label>
          <p>Si cambias el correo, deberás confirmarlo desde el enlace enviado a la nueva dirección. Hasta entonces se mantiene el anterior.</p>
        </ManagementForm>
        {user.staff_status === "approved" && !user.is_owner ? <ManagementForm action="leave-staff" label="Solicitar mi baja de Staff (sin dar de baja la comunidad)">
          <label>Motivo<textarea name="reason" maxLength={1000} required /></label>
        </ManagementForm> : null}
        {!user.is_owner ? <ManagementForm action="request-withdrawal" label="Solicitar baja de mi cuenta">
          <label>Solicitud<textarea name="reason" maxLength={1000} required /></label>
          <p>La organización tramitará la solicitud; si eres capitán, primero se requiere un relevo aprobado.</p>
        </ManagementForm> : null}
        <ManagementForm action="logout" label="Cerrar sesión" />
        <p><a href="mailto:techriders@tajamar365.com">Contactar con organización</a></p>
      </section>
    </IntranetShell>;
  }

  return <IntranetShell {...shellProps}>
    <div className={styles.screenGrid}>
      <Link className={`${styles.screenCard} ${styles.screenCardLink}`} href="/memoria">
        <p className={styles.featureLabel}>MEMORIA DE LA LEAGUE</p>
        <h2>Recursos y memoria</h2>
        <p>Consulta materiales y aprendizajes de temporadas anteriores.</p>
      </Link>
      <Link className={`${styles.screenCard} ${styles.screenCardLink}`} href="/retos">
        <p className={styles.featureLabel}>RETOS</p>
        <h2>Retos públicos</h2>
        <p>Revisa las actividades y desafíos de la temporada.</p>
      </Link>
      <Link className={`${styles.screenCard} ${styles.screenCardLink}`} href="/codigo-de-conducta">
        <p className={styles.featureLabel}>COMUNIDAD</p>
        <h2>Código de conducta</h2>
        <p>Principios para colaborar y construir de forma segura.</p>
      </Link>
    </div>
  </IntranetShell>;
}
