import { database } from "../src/lib/management/db.ts";
import { retireSeason } from "../src/lib/management/operations.ts";

try {
  const owners = await database().query("SELECT * FROM users WHERE is_owner AND disabled_at IS NULL AND verified_at IS NOT NULL");
  if (!owners.rows[0]) throw new Error("Se necesita el responsable inicial activo.");
  const due = await database().query("SELECT retention_at,retired_at,retention_at<=now() AS due FROM seasons WHERE id='2027'");
  if (!due.rows[0]) throw new Error("Temporada no configurada.");
  if (due.rows[0].retired_at) console.log("La temporada ya está retirada.");
  else if (!due.rows[0].due) console.log(`Todavía no corresponde retirar datos. Corte: ${due.rows[0].retention_at.toISOString()}`);
  else {
    await retireSeason(owners.rows[0]);
    console.log("Datos personales de participación retirados; ranking histórico anonimizado.");
  }
} finally {
  await database().end();
}
