import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
function derive(value: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(value, salt, 64, (error, result) => error ? reject(error) : resolve(result));
  });
}
export function token() { return randomBytes(32).toString("hex"); }
export function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  const result = await derive(value, salt);
  return `scrypt:${salt}:${result.toString("hex")}`;
}
export async function verifyPassword(value: string, stored: string) {
  const [algorithm, salt, encoded] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !encoded) throw new Error("Invalid stored credential format.");
  const expected = Buffer.from(encoded, "hex");
  const result = await derive(value, salt);
  return expected.length === result.length && timingSafeEqual(expected, result);
}
