export class ManagementError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const TERMS_VERSION = "league-2027-v1";

export function text(value: unknown, label: string, max = 100): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new ManagementError(`${label}: introduce un valor de entre 1 y ${max} caracteres.`);
  }
  return value.trim();
}

export function email(value: unknown): string {
  const result = text(value, "Correo", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new ManagementError("Introduce un correo válido.");
  return result;
}

export function password(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) {
    throw new ManagementError("La contraseña debe tener entre 12 y 128 caracteres.");
  }
  return value;
}

export function teamName(value: unknown) {
  const name = text(value, "Nombre de equipo", 60).normalize("NFKC").replace(/\s+/g, " ");
  return { name, key: name.toLocaleLowerCase("es") };
}

export function uuid(value: unknown): string {
  const result = text(value, "Identificador", 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)) {
    throw new ManagementError("Identificador no válido.");
  }
  return result;
}
