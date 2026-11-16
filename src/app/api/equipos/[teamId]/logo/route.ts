import { randomUUID, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { database, transaction } from "../../../../../lib/management/db";
import { sessionUser } from "../../../../../lib/management/service";
import { appUrl } from "../../../../../lib/management/mail";
import { ManagementError, uuid } from "../../../../../lib/management/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cookieName = process.env.NODE_ENV === "production" ? "__Host-league-session" : "league-session";
const MIME_TYPES: Record<string, "png" | "jpeg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
};

async function authenticatedUser() {
  const store = await cookies();
  const user = await sessionUser(store.get(cookieName)?.value);
  if (!user) throw new ManagementError("Debes iniciar sesión.", 401);
  return user;
}

export async function GET(_request: Request, context: { params: Promise<{ teamId: string }> }) {
  try {
    const actor = await authenticatedUser();
    const teamId = uuid((await context.params).teamId);
    const result = await database().query<{ media_type: string; contents: Buffer }>(
      `SELECT a.media_type,a.contents FROM teams t JOIN team_logo_assets a ON a.id=t.logo_asset_id
       WHERE t.id=$1 AND (
         EXISTS(SELECT 1 FROM members m WHERE m.team_id=t.id AND m.user_id=$2 AND m.active)
         OR EXISTS(SELECT 1 FROM substitutions s WHERE s.team_id=t.id AND s.user_id=$2)
         OR $3 OR EXISTS(SELECT 1 FROM staff_world_assignments w WHERE w.user_id=$2 AND w.active)
       )`, [teamId, actor.id, Boolean(actor.is_owner || actor.is_league_admin)]);
    const asset = result.rows[0];
    if (!asset) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(asset.contents), {
      headers: {
        "Content-Type": asset.media_type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ManagementError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Team logo read failed", error);
    return NextResponse.json({ error: "No se pudo cargar el logo." }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  try {
    if (request.headers.get("origin") !== appUrl()) throw new ManagementError("Origen de solicitud no permitido.", 403);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) {
      throw new ManagementError("Se requiere una carga multipart.", 415);
    }
    const actor = await authenticatedUser();
    const policy = await database().query<{
      logo_max_bytes: number; logo_max_width: number; logo_max_height: number; logo_allowed_media_types: string[];
    }>(
      `SELECT logo_max_bytes,logo_max_width,logo_max_height,logo_allowed_media_types
       FROM season_rules WHERE season='2027'`);
    const rules = policy.rows[0];
    if (!rules) throw new ManagementError("Falta configurar la política de logos.", 503);
    const contentLength = Number(request.headers.get("content-length"));
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > rules.logo_max_bytes + 65536) {
      throw new ManagementError("La carga supera el tamaño máximo configurado.", 413);
    }
    const form = await request.formData();
    const value = form.get("file");
    if (!(value instanceof File) || value.size < 1 || value.size > rules.logo_max_bytes) {
      throw new ManagementError("Selecciona un archivo dentro del tamaño máximo configurado.");
    }
    if (!rules.logo_allowed_media_types.includes(value.type) || !MIME_TYPES[value.type]) {
      throw new ManagementError("El formato del logo no está permitido.");
    }
    const original = Buffer.from(await value.arrayBuffer());
    const decoded = sharp(original, { failOn: "error", limitInputPixels: rules.logo_max_width * rules.logo_max_height });
    const metadata = await decoded.metadata();
    if (metadata.format !== MIME_TYPES[value.type] || !metadata.width || !metadata.height ||
      metadata.width > rules.logo_max_width || metadata.height > rules.logo_max_height) {
      throw new ManagementError("El archivo no coincide con su formato o supera las dimensiones configuradas.");
    }
    const encoded = await sharp(original, { failOn: "error", limitInputPixels: rules.logo_max_width * rules.logo_max_height })
      .rotate().toFormat(MIME_TYPES[value.type]).toBuffer({ resolveWithObject: true });
    if (encoded.data.byteLength > rules.logo_max_bytes || encoded.info.width > rules.logo_max_width || encoded.info.height > rules.logo_max_height) {
      throw new ManagementError("El logo procesado supera el tamaño máximo configurado.");
    }
    const teamId = uuid((await context.params).teamId);
    const assetId = randomUUID();
    const sha = createHash("sha256").update(encoded.data).digest("hex");
    await transaction(async client => {
      const team = await client.query<{ captain_id: string; captain_active: boolean; status: string }>(
        "SELECT captain_id,captain_active,status FROM teams WHERE id=$1 FOR UPDATE", [teamId]);
      const row = team.rows[0];
      if (!row || row.captain_id !== actor.id || !row.captain_active || row.status === "withdrawn" || row.status === "rejected") {
        throw new ManagementError("Solo el capitán activo puede cambiar el logo de su equipo.", 403);
      }
      const member = await client.query(
        "SELECT 1 FROM members WHERE team_id=$1 AND user_id=$2 AND active", [teamId, actor.id]);
      if (!member.rowCount) throw new ManagementError("La membresía activa del capitán no está disponible.", 403);
      const previous = await client.query<{ logo_asset_id: string | null }>(
        "SELECT logo_asset_id FROM teams WHERE id=$1", [teamId]);
      await client.query(
        `INSERT INTO team_logo_assets(id,team_id,media_type,contents,sha256,width,height,uploaded_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [assetId, teamId, `image/${encoded.info.format}`, encoded.data, sha, encoded.info.width, encoded.info.height, actor.id]);
      await client.query("UPDATE teams SET logo_asset_id=$2 WHERE id=$1", [teamId, assetId]);
      await client.query(
        "INSERT INTO audit_log(actor_id,action,target_id,details) VALUES($1,'team.logo_updated',$2,$3)",
        [actor.id, teamId, JSON.stringify({ assetId, previousAssetId: previous.rows[0]?.logo_asset_id ?? null, sha })]);
    });
    return NextResponse.json({ message: "Logo validado, re-encodeado y guardado." });
  } catch (error) {
    if (error instanceof ManagementError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Team logo upload failed", error);
    return NextResponse.json({ error: "No se pudo guardar el logo. Contacta con organización." }, { status: 503 });
  }
}
