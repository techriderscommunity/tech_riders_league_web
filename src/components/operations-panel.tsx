import { ManagementForm } from "./management-form";
import { operationsDashboard } from "../lib/management/operations";
import type { User } from "../lib/management/service";
import { githubDashboard } from "../lib/management/github";
import { oauthSettings } from "../lib/management/github-api";
import { MissionDelivery } from "./mission-delivery";

function Reason() {
  return <label>Motivo / comprobación<textarea name="reason" maxLength={1000} required /></label>;
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
export async function OperationsPanel({ user, teamId, search = "" }: { user: User; teamId?: string; search?: string }) {
  const data = await operationsDashboard(user, teamId);
  const github = await githubDashboard(user, teamId);
  const staff = !teamId;
  const accountOptions = data.accounts.map(p => <option value={p.id} key={p.id}>{p.first_name} {p.last_name} · {p.email}</option>);
  const participantOptions = data.accounts.filter(p => !p.is_owner && !["pending", "approved"].includes(p.staff_status)).map(p => <option value={p.id} key={p.id}>{p.first_name} {p.last_name} · {p.email}</option>);
  if (data.season.retired_at) return <section><h2>Temporada archivada</h2><p>Se han retirado los datos personales de participación. El ranking histórico permanece anonimizado.</p></section>;
  return <>
    <details className="management-section" open={!staff || Boolean(search)}><summary>{staff ? "Operación de equipos y mundos" : "Mundos de mi equipo"}</summary>
      {staff ? <form method="get" className="management-form"><label>Buscar equipo<input name="equipo" type="search" /></label><button>Buscar</button></form> : null}
      {staff ? <a className="button-link" href="/api/gestion/export">Exportar equipos y asistencia (CSV para Excel)</a> : null}
      {!data.views.length ? <p>No hay equipos aprobados disponibles.</p> : null}
      {data.views.filter(v => v.team.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"))).map(view => <details key={view.team.id} className="management-card" open={!staff}>
        <summary>{view.team.name} · {view.eligibility.worlds}/4 mundos válidos · {view.eligibility.eligible ? "Candidato a la final" : "Aún no candidato"}</summary>
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
        {view.worlds.map(({ event, people }) => {
          const current = data.submissions.filter(s => s.team_id === view.team.id && s.event_id === event.id && s.current);
          const challenge = data.challenges.find(c => c.event_id === event.id);
          const canManage = !staff && view.team.captain_id === user.id && view.team.captain_active;
          return <details key={event.id} className="management-card">
            <summary>{event.name} · {event.closed ? "Cerrado" : "Abierto"}</summary>
            <ul>{people.map(p => <li key={p.id}>
              {p.first_name} {p.last_name} · {p.original ? "Original" : "Sustituto"} · Luma: {p.luma ? "Validado" : "Pendiente"} · Asistencia: {p.present ? "Sí" : "No"} · Al final: {p.at_end ? "Sí" : "No"}
              {staff && !event.closed ? <ManagementForm action="attendance" values={{ teamId: view.team.id, eventId: event.id, userId: p.id }} label="Guardar comprobaciones">
                <p>Correo para comprobar manualmente en Luma: {p.email}</p>
                <label className="management-check"><input name="luma" type="checkbox" defaultChecked={p.luma} />Registro Luma comprobado</label>
                <label className="management-check"><input name="present" type="checkbox" defaultChecked={p.present} />Está presente</label>
                <label className="management-check"><input name="atEnd" type="checkbox" defaultChecked={p.at_end} />Está al final del evento</label>
                <Reason />
              </ManagementForm> : null}
            </li>)}</ul>
            {(staff || canManage) && !event.closed ? <>
              <ManagementForm action="invite-substitute" values={{ teamId: view.team.id, eventId: event.id }} label="Invitar sustituto para este mundo">
                <label>Original ausente<select name="originalId" required>{view.originals.filter(p => p.active && p.original).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select></label>
                <label>Correo Luma del sustituto<input type="email" name="email" required /></label>
                <p>El sustituto debe registrarse y aceptar personalmente; también puede hacerlo en el acceso al evento.</p>
              </ManagementForm>
              <ManagementForm action="cancel-substitute" values={{ teamId: view.team.id, eventId: event.id }} label="Cancelar sustitución o invitación de este mundo"><Reason /></ManagementForm>
            </> : null}
            {challenge ? <section><h4>{challenge.title} · v{challenge.version}</h4><p className="management-text">{challenge.instructions}</p>
              <p>{challenge.deadline ? `Plazo: ${new Date(challenge.deadline).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}` : "Sin plazo acordado"} · {challenge.status}</p>
            </section> : <p>Reto todavía no publicado.</p>}
            {current.map(s => <section key={s.id}><h4>{s.kind === "photo" ? "Foto" : "Entrega del reto"}</h4>
              <a href={s.url} target="_blank" rel="noopener noreferrer">{s.commit_sha ? "Ver el commit entregado en GitHub (privado)" : "Ver evidencia"}</a>
              {s.commit_sha ? <><p className="management-text">MISIÓN ENTREGADA · SHA: {s.commit_sha} · Rama: {s.branch} · Repositorio: {s.github_full_name}</p>
                {staff ? <><a href={`/api/github/snapshot/${s.id}`}>Descargar snapshot privado del SHA para evaluar</a><p>Evalúa esta versión exacta, no la rama actual. En GitHub: clona el repositorio privado con credenciales propias autorizadas y ejecuta <code>git checkout {s.commit_sha}</code>. El snapshot permite recuperar los archivos aunque el capitán borre el commit.</p></> : null}
              </> : null}
              <p>{s.status} · {s.reason ?? "Pendiente de revisión"} · {new Date(s.submitted_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</p>
              {staff && !event.evaluation_closed && (s.commit_sha || !event.closed) ? <ManagementForm action="review-evidence" values={{ id: s.id }} label="Guardar revisión">
                <label>Resultado<select name="status" required><option value="approved">Aprobar</option><option value="correction">Pedir corrección</option><option value="rejected">Rechazar</option></select></label><Reason />
              </ManagementForm> : null}
            </section>)}
            {canManage && !event.closed && !event.evaluation_closed ? (["challenge", "photo"] as const).map(kind => {
              const previous = current.find(s => s.kind === kind);
              if (kind === "challenge") return <MissionDelivery key={kind} teamId={view.team.id} eventId={event.id} previousId={previous?.id} />;
              return <ManagementForm key={kind} action="submit-evidence" values={{ teamId: view.team.id, eventId: event.id, kind, ...(previous ? { previousId: previous.id } : {}) }} label={kind === "photo" ? "Enviar foto a revisión" : "Entregar reto"}>
                <label>{kind === "photo" ? "Enlace a foto etiquetando comunidades y sponsors" : "Enlace de la entrega"}<input name="url" type="url" maxLength={2000} required /></label>
                {previous ? <p>Reenviar crea una versión nueva y una nueva fecha para el bonus; la anterior queda en el historial.</p> : null}
              </ManagementForm>;
            }) : null}
            <h4>Desglose de puntos validados</h4>
            <ul>{data.movements.filter(m => m.team_id === view.team.id && m.event_id === event.id).map(m => <li key={m.concept}>{({ attendance: "Asistencia", photo: "Foto", challenge: "Reto", bonus: "Bonus" } as Record<string, string>)[m.concept]}: {m.points}</li>)}</ul>
          </details>;
        })}
        {!staff && view.team.captain_id === user.id && view.team.captain_active ? <ManagementForm action="request-captain" values={{ teamId: view.team.id }} label="Solicitar cambio de capitán">
          <label>Nuevo capitán<select name="nextId" required>{view.originals.filter(p => p.active && p.original && p.id !== user.id).map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select></label><Reason />
        </ManagementForm> : null}
        {staff ? <ManagementForm action="replace-member" values={{ teamId: view.team.id }} label="Aprobar relevo por fuerza mayor">
          <label>Integrante que causa baja<select name="previousId" required>{view.originals.filter(p => p.active).map(p => <option value={p.id} key={p.id}>{p.first_name} {p.last_name}</option>)}</select></label>
          <label>Cuenta verificada de relevo<select name="nextId" required>{participantOptions}</select></label><Reason />
          <p>El relevo no se convierte en original ni concede continuidad ficticia. No puede seguir activo en otro equipo.</p>
        </ManagementForm> : null}
      </details>)}
    </details>
    <details className="management-section"><summary>Cambios de capitán</summary><ul>{data.changes.map(c => <li key={c.id}>{c.reason} · {c.status} · {c.review_reason}
      {staff && c.status === "pending" ? <ManagementForm action="review-captain" values={{ id: c.id }} label="Resolver cambio">
        <label>Decisión<select name="status"><option value="approved">Aprobar y enviar activación</option><option value="rejected">Rechazar</option></select></label><Reason />
      </ManagementForm> : null}
    </li>)}</ul></details>
    {staff ? <>
      <details className="management-section"><summary>Retos y cierre de eventos</summary>
        {data.events.map(event => {
          const c = data.challenges.find(ch => ch.event_id === event.id);
          return <details className="management-card" key={event.id}><summary>{event.name}</summary>
            {!event.closed ? <ManagementForm action="save-challenge" values={{ eventId: event.id, ...(c ? { version: String(c.version) } : {}) }} label="Guardar versión del reto">
              <label>Título<input name="title" maxLength={200} defaultValue={c?.title} required /></label>
              <label>Enunciado<textarea name="instructions" maxLength={4000} defaultValue={c?.instructions} required /></label>
              <label>Plazo opcional (ISO con zona horaria)<input name="deadline" placeholder="2027-01-15T18:00:00+01:00" defaultValue={c?.deadline ? new Date(c.deadline).toISOString() : ""} /></label>
              <label>Estado<select name="status" defaultValue={c?.status ?? "draft"}><option value="draft">Borrador</option><option value="published">Publicado / abierto</option><option value="closed">Reto cerrado</option></select></label>
              <label className="management-check"><input type="checkbox" name="allowResubmission" defaultChecked={c?.allow_resubmission ?? true} />Permitir sustituir una entrega antes del deadline</label>
            </ManagementForm> : null}
            <ManagementForm action="event-state" values={{ eventId: event.id }} label={event.closed ? "Reabrir evento" : "Cerrar evento"}>
              <label className="management-check"><input type="checkbox" name="closed" defaultChecked={!event.closed} />Evento cerrado</label><Reason />
            </ManagementForm>
            <p>Evaluación: {event.evaluation_closed ? "Cerrada" : "Pendiente / en curso"}. Las misiones se evalúan tras el deadline y permanecen privadas.</p>
            {!event.evaluation_closed ? <ManagementForm action="close-evaluation" values={{ eventId: event.id }} label="Cerrar evaluación de este mundo"><Reason /></ManagementForm> : null}
          </details>;
        })}
      </details>
      <details className="management-section"><summary>Publicar soluciones seleccionadas · Top 3 por mundo</summary>
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
      </details>
      <details className="management-section"><summary>Revisión y publicación de resultados</summary>
        <p>Publica primero los mundos y después la global. Una corrección retira la publicación afectada hasta revisarla de nuevo. Las posiciones nunca se deciden automáticamente si hay empate.</p>
        {data.previews.map(({ event, preview }) => <details key={event.id}><summary>{event.name}</summary>
          {preview.bonus.pending ? <RankingReview scope={`bonus:${event.id}`} preview={preview.bonus} /> : null}
          <RankingReview scope={event.id} preview={preview} />
        </details>)}
        {data.global ? <RankingReview scope="global" preview={data.global} /> : null}
      </details>
      <details className="management-section"><summary>Vouchers y premios</summary>
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
      </details>
      <details className="management-section"><summary>Comunidades y bajas</summary>
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
      </details>
      <details className="management-section"><summary>Colaboradores, aportaciones y recursos</summary>
        <p>No se comparten datos de participantes con sponsors. Solo se publica el recurso si hay autorización explícita.</p>
        {[null, ...data.contributions].map(c => <ManagementForm key={c?.id ?? "new"} action="save-contribution" values={c ? { id: c.id } : {}} label={c ? "Actualizar aportación" : "Añadir aportación"}>
          <label>Colaborador<input name="name" maxLength={200} defaultValue={c?.name} required /></label>
          <label>Aportación<textarea name="description" maxLength={1000} defaultValue={c?.description} required /></label>
          <label>Destino<textarea name="destination" maxLength={1000} defaultValue={c?.destination} required /></label>
          <label>Importe (céntimos; 0 para especie)<input name="amountCents" type="number" min="0" step="1" defaultValue={c?.amount_cents ?? 0} required /></label>
          <label>Recurso o memoria (HTTPS, opcional)<input name="url" type="url" defaultValue={c?.resource_url ?? ""} /></label>
          <label className="management-check"><input name="authorized" type="checkbox" defaultChecked={c?.authorized} />Publicación del recurso autorizada</label>
        </ManagementForm>)}
      </details>
      {user.is_owner ? <details className="management-section"><summary>Retención de temporada</summary>
        <p>Corte previsto: {new Date(data.season.retention_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}. La retirada conserva cuentas de staff activo, elimina datos operativos personales y sustituye los nombres del ranking por alias históricos.</p>
        <ManagementForm action="set-retention" label="Configurar inicio de próxima temporada">
          <label>Fecha ISO con zona horaria<input name="date" required /></label>
        </ManagementForm>
        <ManagementForm action="retire-season" label="Ejecutar retirada al llegar el corte"><label className="management-check"><input name="confirmed" type="checkbox" required />Confirmo la retirada irreversible de datos de esta temporada</label></ManagementForm>
      </details> : null}
      <details className="management-section"><summary>Auditoría de las últimas 100 operaciones</summary><ul>{data.audits.map(a => <li key={a.id}>{new Date(a.created_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })} · {a.action}<pre className="management-text">{JSON.stringify(a.details)}</pre></li>)}</ul></details>
    </> : <section><h2>Historial de entregas</h2><ul>{data.submissions.map(s => <li key={s.id}>{s.event_id} · {s.kind} · {s.status} · {s.current ? "Actual" : "Versión anterior"} · {new Date(s.submitted_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</li>)}</ul></section>}
  </>;
}
