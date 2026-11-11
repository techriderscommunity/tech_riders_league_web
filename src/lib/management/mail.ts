import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { PoolClient } from "pg";
import { database, transaction } from "./db.ts";
import { token, digest } from "./crypto.ts";

export function appUrl() {
  if (!process.env.APP_URL) throw new Error("APP_URL no está configurada.");
  const url = new URL(process.env.APP_URL);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("APP_URL debe usar HTTPS en producción.");
  }
  return url.origin;
}
export async function queueMail(client: PoolClient, recipient: string, subject: string, body: string) {
  await client.query("INSERT INTO mail_outbox(id,recipient,subject,body) VALUES($1,$2,$3,$4)",
    [randomUUID(), recipient, subject, body]);
}
export async function accountMail(client: PoolClient, userId: string, recipient: string, purpose: "verify" | "reset", newEmail?: string) {
  const value = token();
  await client.query("UPDATE account_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL",
    [userId, purpose]);
  await client.query("INSERT INTO account_tokens(token_hash,user_id,purpose,expires_at,new_email) VALUES($1,$2,$3,now()+interval '1 hour',$4)",
    [digest(value), userId, purpose, newEmail ?? null]);
  await queueMail(client, recipient, purpose === "verify" ? "Confirma tu registro en la League" : "Activa tu contraseña en la League",
    `${purpose === "verify" ? "Confirma tu correo" : "Crea o restablece tu contraseña"}: ${appUrl()}/acceso?token=${value}&purpose=${purpose}\nEl enlace caduca en una hora. Si no lo has solicitado, ignora este correo.`);
}

export async function sendQueuedMail() {
  if (!process.env.SMTP_HOST || !process.env.MAIL_FROM) throw new Error("El servicio de correo no está configurado.");
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (![465, 587].includes(port) && process.env.NODE_ENV === "production") {
    throw new Error("SMTP de producción debe usar TLS.");
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    requireTLS: process.env.NODE_ENV === "production",
    ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } } : {}),
    connectionTimeout: 10000, socketTimeout: 20000,
  });
  let sent = 0;
  for (let i = 0; i < 25; i++) {
    const mail = await transaction(async client => {
      const result = await client.query<{ id: string; recipient: string; subject: string; body: string }>(
        `SELECT id,recipient,subject,body FROM mail_outbox
         WHERE status='pending' OR (status='sending' AND lease_until<now())
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`);
      const row = result.rows[0];
      if (row) await client.query("UPDATE mail_outbox SET status='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes' WHERE id=$1", [row.id]);
      return row;
    });
    if (!mail) break;
    try {
      const result = await transport.sendMail({ from: process.env.MAIL_FROM, to: mail.recipient, subject: mail.subject, text: mail.body });
      if (!result.accepted.length || result.rejected.length) throw new Error("SMTP rejected recipient.");
      await database().query("UPDATE mail_outbox SET status='sent',body='',sent_at=now(),last_error=NULL,lease_until=NULL WHERE id=$1", [mail.id]);
      sent++;
    } catch (error) {
      console.error("Mail delivery failed", { mailId: mail.id, error });
      await database().query("UPDATE mail_outbox SET status='failed',last_error=$2,lease_until=NULL WHERE id=$1",
        [mail.id, "El proveedor no confirmó la entrega. Revisa configuración y reintenta."]);
      throw error;
    }
  }
  return sent;
}
