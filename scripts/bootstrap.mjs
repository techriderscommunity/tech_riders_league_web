import { randomUUID } from "node:crypto";
import { transaction, database } from "../src/lib/management/db.ts";
import { hashPassword, token } from "../src/lib/management/crypto.ts";
import { accountMail } from "../src/lib/management/mail.ts";
import { email, TERMS_VERSION } from "../src/lib/management/validation.ts";

const address = email(process.env.BOOTSTRAP_EMAIL);
try {
  await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(742028)");
    const owner = await client.query("SELECT id FROM users WHERE is_owner");
    if (owner.rowCount) throw new Error("A responsible account already exists. Bootstrap cannot replace it.");
    const existing = await client.query("SELECT id FROM users WHERE email=$1 FOR UPDATE", [address]);
    const id = existing.rows[0]?.id ?? randomUUID();
    const participation = await client.query("SELECT 1 FROM members WHERE user_id=$1 AND active UNION ALL SELECT 1 FROM substitutions WHERE user_id=$1", [id]);
    if (participation.rowCount) throw new Error("A participant cannot become the responsible account while linked to a team.");
    if (!existing.rowCount) {
      await client.query(`INSERT INTO users(id,email,first_name,last_name,password_hash,staff_status,is_owner,terms_version)
        VALUES($1,$2,'Responsable','League',$3,'approved',true,$4)`,
        [id, address, await hashPassword(token()), "pending-activation"]);
    } else await client.query("UPDATE users SET is_owner=true,staff_status='approved' WHERE id=$1", [id]);
    await accountMail(client, id, address, "reset");
    await client.query("INSERT INTO audit_log(actor_id,action,target_id) VALUES($1,'owner.bootstrapped',$1)", [id]);
  });
  console.log("Responsible account created. Activation email is queued; configure SMTP and process the outbox.");
} finally { await database().end(); }
