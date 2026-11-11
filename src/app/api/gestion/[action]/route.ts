import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { database } from "../../../../lib/management/db";
import { digest } from "../../../../lib/management/crypto";
import { appUrl, sendQueuedMail } from "../../../../lib/management/mail";
import { ManagementError, email, uuid } from "../../../../lib/management/validation";
import * as service from "../../../../lib/management/service";
import * as operations from "../../../../lib/management/operations";
import * as github from "../../../../lib/management/github";

export const runtime = "nodejs";
const cookieName = process.env.NODE_ENV === "production" ? "__Host-league-session" : "league-session";
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 43200 };

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    if (request.headers.get("origin") !== appUrl()) throw new ManagementError("Origen de solicitud no permitido.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ManagementError("Se requiere JSON.", 415);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 32768) throw new ManagementError("Solicitud demasiado grande.", 413);
    let input: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      input = parsed as Record<string, unknown>;
    } catch { throw new ManagementError("JSON no válido."); }
    const { action } = await context.params;
    const store = await cookies();
    const publicActions = ["register", "login", "reset", "verify-mail", "redeem"];
    if (publicActions.includes(action)) {
      await service.limit(`public-global:${action}`, 1000);
      await service.limit(`public:${action}:${action === "redeem" ? String(input.token) : email(input.email)}`);
      if (action === "register") {
        await service.register(input);
        return NextResponse.json({ message: "Registro guardado. Debes confirmar tu correo. El envío está pendiente de procesamiento.", redirect: null });
      }
      if (action === "login") {
        store.set(cookieName, await service.login(input), cookieOptions);
        const invitation = typeof input.invitation === "string" && /^[a-f0-9]{64}$/.test(input.invitation) ? input.invitation : null;
        return NextResponse.json({ message: "Sesión iniciada.", redirect: invitation ? `/mi-equipo?invitacion=${invitation}` : "/mi-equipo" });
      }
      if (action === "redeem") {
        await service.redeem(input);
        return NextResponse.json({ message: "Correo confirmado o contraseña activada. Ya puedes entrar." });
      }
      await service.requestAccountMail(input, action === "reset" ? "reset" : "verify");
      return NextResponse.json({ message: "Si el correo corresponde a una cuenta, la solicitud de envío queda registrada. Revisa tu bandeja cuando se procese." });
    }
    const user = await service.sessionUser(store.get(cookieName)?.value);
    if (!user) throw new ManagementError("Debes iniciar sesión.", 401);
    if (action === "logout") {
      const value = store.get(cookieName)?.value;
      if (value) await database().query("DELETE FROM sessions WHERE token_hash=$1", [digest(value)]);
      store.set(cookieName, "", { ...cookieOptions, maxAge: 0 });
      return NextResponse.json({ message: "Sesión cerrada.", redirect: "/acceso" });
    }
    const eventOperation = user.staff_status === "approved" && ["attendance", "review-evidence"].includes(action);
    await service.limit(`user:${user.id}:${action}`, eventOperation ? 600 : 30);
    if (["review", "send-mail", "retry-mail"].includes(action)) {
      service.requireStaff(user);
      if (action === "review") await service.review(user, input);
      if (action === "send-mail") {
        const sent = await sendQueuedMail();
        return NextResponse.json({ message: `${sent} mensajes aceptados por el servicio de correo.` });
      }
      if (action === "retry-mail") {
        const result = await database().query("UPDATE mail_outbox SET status='pending',last_error=NULL WHERE id=$1 AND status='failed' RETURNING id", [uuid(input.id)]);
        if (!result.rowCount) throw new ManagementError("El mensaje no está en estado fallido.");
      }
    } else {
      switch (action) {
        case "create-team": await service.createTeam(user, input); break;
        case "invite": await service.invite(user, input); break;
        case "accept": {
          const invitation = await database().query<{ event_id: string | null }>("SELECT event_id FROM invitations WHERE token_hash=$1", [digest(String(input.token))]);
          if (invitation.rows[0]?.event_id) await operations.acceptSubstitute(user, input);
          else await service.acceptInvitation(user, input);
          break;
        }
        case "cancel-invitation": await service.cancelInvitation(user, input); break;
        case "rename-team": await service.renameTeam(user, input); break;
        case "submit-team": await service.submitTeam(user, input); break;
        case "invite-substitute": await operations.inviteSubstitute(user, input); break;
        case "cancel-substitute": await operations.cancelSubstitute(user, input); break;
        case "attendance": await operations.markAttendance(user, input); break;
        case "request-captain": await operations.requestCaptain(user, input); break;
        case "review-captain": await operations.reviewCaptain(user, input); break;
        case "replace-member": await operations.replaceMember(user, input); break;
        case "save-challenge": await operations.saveChallenge(user, input); break;
        case "submit-evidence": await operations.submitEvidence(user, input); break;
        case "github-link": {
          const session = store.get(cookieName)?.value;
          if (!session) throw new ManagementError("Sesión no disponible.", 401);
          return NextResponse.json({ externalRedirect: await github.startGitHub(user, session, input) });
        }
        case "github-preview": return NextResponse.json({ commit: await github.commitPreview(user, input), message: "Último commit consultado. Revisa el SHA antes de entregar." });
        case "deliver-mission": await github.deliverMission(user, input); break;
        case "close-evaluation": await github.closeEvaluation(user, input); break;
        case "prepare-solution": await github.prepareSolution(user, input); break;
        case "publish-solution": await github.publishSolution(user, input); break;
        case "sync-solution": await github.syncSolution(user, input); break;
        case "recover-solution": await github.resetSolution(user, input); break;
        case "cancel-solution": await github.cancelSolution(user, input); break;
        case "review-evidence": await operations.reviewEvidence(user, input); break;
        case "resolve-tie": await operations.resolveTie(user, input); break;
        case "publish-results": await operations.publishResults(user, input); break;
        case "event-state": await operations.setEventState(user, input); break;
        case "award": await operations.award(user, input); break;
        case "leave-staff": await operations.leaveStaff(user, input); break;
        case "community-state": await operations.communityState(user, input); break;
        case "staff-community": await operations.addStaffCommunity(user, input); break;
        case "request-withdrawal": await operations.requestWithdrawal(user, input); break;
        case "update-profile": await operations.updateProfile(user, input); break;
        case "review-withdrawal": await operations.reviewWithdrawal(user, input); break;
        case "save-contribution": await operations.saveContribution(user, input); break;
        case "set-retention": await operations.setRetention(user, input); break;
        case "retire-season":
          if (input.confirmed !== true) throw new ManagementError("Confirma la retirada irreversible de los datos.");
          await operations.retireSeason(user); break;
        default: throw new ManagementError("Acción desconocida.", 404);
      }
    }
    return NextResponse.json({ message: "Cambio guardado. Los avisos de correo quedan pendientes de envío." });
  } catch (error) {
    if (error instanceof ManagementError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Ya existe ese correo, nombre de equipo o pertenencia. Revisa los datos." }, { status: 409 });
    }
    console.error("Management request failed", error);
    return NextResponse.json({ error: "No se pudo completar la operación. Revisa la configuración o contacta con organización." }, { status: 503 });
  }
}
