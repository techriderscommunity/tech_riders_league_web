import Link from "next/link";
import { ManagementForm } from "./management-form";
import { TERMS_VERSION } from "../lib/management/validation";
import { AccessDialog } from "./access-dialog";

export function AccessContent({ params = {} }: {
  params?: { token?: string; purpose?: string; invitacion?: string };
}) {
  const enabled = process.env.REGISTRATION_ENABLED === "true";
  return <>
    {params.token && ["verify", "reset"].includes(params.purpose ?? "") ? (
      <section>
        <h2>{params.purpose === "verify" ? "Confirma tu correo" : "Activa tu contraseña"}</h2>
        <ManagementForm action="redeem" values={{ token: params.token, purpose: params.purpose ?? "" }} label="Confirmar">
          {params.purpose === "reset" ? <label>Nueva contraseña<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></label> : null}
          {params.purpose === "reset" ? <>
            <label className="management-check"><input name="adult" type="checkbox" required />Confirmo que tengo al menos 18 años.</label>
            <label className="management-check"><input name="accepted" type="checkbox" required /><span>Acepto las <Link href="/privacidad" target="_blank">condiciones de participación, privacidad y autorización audiovisual</Link>.</span></label>
          </> : null}
        </ManagementForm>
      </section>
    ) : null}
    <section>
      <h2>Entrar</h2>
      <ManagementForm action="login" values={params.invitacion ? { invitation: params.invitacion } : {}} label="Entrar">
        <label>Correo<input name="email" type="email" autoComplete="username" required /></label>
        <label>Contraseña<input name="password" type="password" minLength={12} maxLength={128} autoComplete="current-password" required /></label>
      </ManagementForm>
    </section>
    <AccessDialog label="¿No tienes cuenta? Regístrate" title="Registro individual">
      <p>El capitán se registra primero y crea el equipo. Los integrantes se registran con el correo de su invitación, el mismo que en Luma.</p>
      {enabled ? <ManagementForm action="register" label="Registrarme">
        <label>Nombre<input name="firstName" maxLength={100} autoComplete="given-name" required /></label>
        <label>Apellidos<input name="lastName" maxLength={100} autoComplete="family-name" required /></label>
        <label>Correo de Luma<input name="email" type="email" autoComplete="email" required /></label>
        <label>Contraseña (mínimo 12 caracteres)<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></label>
        <label className="management-check"><input name="staff" type="checkbox" />Soy staff de una comunidad</label>
        <label>Comunidad (solo si solicitas staff)<input name="community" maxLength={120} /></label>
        <label className="management-check"><input name="adult" type="checkbox" required />Confirmo que tengo al menos 18 años.</label>
        <label className="management-check"><input name="accepted" type="checkbox" required />
          <span>Acepto las condiciones de participación, el tratamiento de datos para gestionar la League y la autorización de uso de mi imagen y voz para su difusión por Tech Riders y las comunidades organizadoras. <Link href="/privacidad" target="_blank">Leer condiciones y privacidad</Link> ({TERMS_VERSION}).</span>
        </label>
      </ManagementForm> : <p>Registro todavía no habilitado. El acceso estará disponible cuando organización complete la configuración.</p>}
    </AccessDialog>
    <AccessDialog label="¿Has olvidado tu contraseña?" title="Recuperar acceso">
      <p>Introduce tu correo y te enviaremos un enlace para crear o restablecer tu contraseña.</p>
      <ManagementForm action="reset" label="Enviar enlace">
        <label>Correo<input name="email" type="email" autoComplete="email" required /></label>
      </ManagementForm>
    </AccessDialog>
  </>;
}
