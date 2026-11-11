import temporadaVersionada from "../../content/temporada.json" with {
  type: "json",
};

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type EstadoDisponible =
  | "confirmado"
  | "pendiente"
  | "parcial"
  | "bloqueado"
  | "en-edicion"
  | "temporalmente-no-disponible";

type EstadoConValor = "confirmado" | "pendiente" | "parcial";
type EstadoSinPublicar =
  | "pendiente"
  | "bloqueado"
  | "en-edicion"
  | "temporalmente-no-disponible";

export type DatoPublicado<T extends JsonValue = JsonValue> = {
  readonly estado: EstadoConValor;
  readonly publicacion: "autorizada";
  readonly valor: T;
  readonly mensaje?: string;
};

export type DatoNoPublicado = {
  readonly estado: EstadoSinPublicar;
  readonly publicacion: "no-autorizada";
  readonly mensaje: string;
};

export type DatoPublico<T extends JsonValue = JsonValue> =
  | DatoPublicado<T>
  | DatoNoPublicado;

export interface EtapaPublica {
  readonly slug: string;
  readonly nombre: DatoPublico<string>;
  readonly fecha: DatoPublico<string>;
  readonly comunidad: DatoPublico<string>;
  readonly descripcion: DatoPublico<string>;
}

export interface SeccionPublica {
  readonly titulo: string;
  readonly descripcion: string;
  readonly contenido: DatoPublico;
  readonly datosAdicionales: Readonly<Record<string, DatoPublico>>;
}

export type PeriodoTemporada = JsonValue & {
  readonly inicio: string;
  readonly fin: string;
};

export interface TemporadaPublica {
  readonly id: string;
  readonly nombre: DatoPublico<string>;
  readonly periodo: DatoPublico<PeriodoTemporada>;
  readonly estructura: DatoPublico;
  readonly fechaSeguridad: DatoPublico<string>;
  readonly etapas: readonly EtapaPublica[];
  readonly secciones: Readonly<Record<string, SeccionPublica>>;
}

const estadosConValor: ReadonlySet<string> = new Set([
  "confirmado",
  "pendiente",
  "parcial",
]);

const estadosSinPublicar: ReadonlySet<string> = new Set([
  "pendiente",
  "bloqueado",
  "en-edicion",
  "temporalmente-no-disponible",
]);

function esEstadoConValor(value: unknown): value is EstadoConValor {
  return typeof value === "string" && estadosConValor.has(value);
}

function esEstadoSinPublicar(value: unknown): value is EstadoSinPublicar {
  return typeof value === "string" && estadosSinPublicar.has(value);
}

function esObjeto(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function esJsonValue(
  value: unknown,
  ancestors: WeakSet<object> = new WeakSet(),
): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "object") {
    return false;
  }

  if (ancestors.has(value)) {
    return false;
  }

  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => esJsonValue(item, ancestors))
    : esObjeto(value) &&
      Object.values(value).every((item) => esJsonValue(item, ancestors));
  ancestors.delete(value);
  return valid;
}

function comprobarClaves(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const unexpectedKey = Object.keys(value).find(
    (key) => !allowedKeys.includes(key),
  );
  if (unexpectedKey !== undefined) {
    throw new TypeError(`Clave no permitida en dato público: ${unexpectedKey}`);
  }
}

function comprobarMensaje(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("El estado sin publicar requiere un mensaje claro.");
  }
  return value;
}

export function parseDatoPublico(value: unknown): DatoPublico {
  if (!esObjeto(value)) {
    throw new TypeError("El dato público debe ser un objeto JSON.");
  }

  const { estado, publicacion, mensaje } = value;

  if (
    publicacion === "autorizada" &&
    esEstadoConValor(estado)
  ) {
    comprobarClaves(value, ["estado", "publicacion", "valor", "mensaje"]);
    if (!Object.hasOwn(value, "valor") || !esJsonValue(value.valor)) {
      throw new TypeError("El dato autorizado requiere un valor JSON válido.");
    }

    if (mensaje !== undefined && typeof mensaje !== "string") {
      throw new TypeError("El mensaje del dato público debe ser texto.");
    }

    return {
      estado: estado as EstadoConValor,
      publicacion: "autorizada",
      valor: value.valor,
      ...(mensaje === undefined ? {} : { mensaje }),
    };
  }

  if (
    publicacion === "no-autorizada" &&
    esEstadoSinPublicar(estado)
  ) {
    comprobarClaves(value, ["estado", "publicacion", "mensaje"]);
    return {
      estado: estado as EstadoSinPublicar,
      publicacion: "no-autorizada",
      mensaje: comprobarMensaje(mensaje),
    };
  }

  throw new TypeError(
    "Combinación de estado y autorización no válida para contenido público.",
  );
}

function parseDatoTexto(value: unknown): DatoPublico<string> {
  const dato = parseDatoPublico(value);
  if (dato.publicacion === "no-autorizada") {
    return dato;
  }
  if (typeof dato.valor !== "string") {
    throw new TypeError("El dato público autorizado debe contener texto.");
  }
  return {
    estado: dato.estado,
    publicacion: "autorizada",
    valor: dato.valor,
    ...(dato.mensaje === undefined ? {} : { mensaje: dato.mensaje }),
  };
}

function leerTexto(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`El campo ${key} debe contener texto.`);
  }
  return value;
}

function leerObjeto(
  value: unknown,
  description: string,
): Record<string, unknown> {
  if (!esObjeto(value)) {
    throw new TypeError(`${description} debe ser un objeto JSON.`);
  }
  return value;
}

function parseEtapa(value: unknown): EtapaPublica {
  const etapa = leerObjeto(value, "La etapa");
  return {
    slug: leerTexto(etapa, "slug"),
    nombre: parseDatoTexto(etapa.nombre),
    fecha: parseDatoTexto(etapa.fecha),
    comunidad: parseDatoTexto(etapa.comunidad),
    descripcion: parseDatoTexto(etapa.descripcion),
  };
}

function parsePeriodo(value: unknown): DatoPublico<PeriodoTemporada> {
  const dato = parseDatoPublico(value);
  if (dato.publicacion === "no-autorizada") {
    return dato;
  }
  if (
    !esObjeto(dato.valor) ||
    typeof dato.valor.inicio !== "string" ||
    typeof dato.valor.fin !== "string"
  ) {
    throw new TypeError("El periodo autorizado requiere inicio y fin.");
  }
  comprobarClaves(dato.valor, ["inicio", "fin"]);
  return {
    estado: dato.estado,
    publicacion: "autorizada",
    valor: { inicio: dato.valor.inicio, fin: dato.valor.fin },
    ...(dato.mensaje === undefined ? {} : { mensaje: dato.mensaje }),
  };
}

function parseSeccion(value: unknown): SeccionPublica {
  const seccion = leerObjeto(value, "La sección");
  const datosAdicionales: Record<string, DatoPublico> = {};
  for (const [key, dato] of Object.entries(seccion)) {
    if (key !== "titulo" && key !== "descripcion" && key !== "contenido") {
      datosAdicionales[key] = parseDatoPublico(dato);
    }
  }
  return {
    titulo: leerTexto(seccion, "titulo"),
    descripcion: leerTexto(seccion, "descripcion"),
    contenido: parseDatoPublico(seccion.contenido),
    datosAdicionales,
  };
}

export function parseTemporadaPublica(value: unknown): TemporadaPublica {
  const record = leerObjeto(value, "La temporada");
  if (!Array.isArray(record.etapas)) {
    throw new TypeError("La temporada debe incluir una lista de etapas.");
  }
  const seccionesRaw = leerObjeto(record.secciones, "Las secciones");
  const secciones: Record<string, SeccionPublica> = {};
  for (const [key, seccion] of Object.entries(seccionesRaw)) {
    secciones[key] = parseSeccion(seccion);
  }
  return {
    id: leerTexto(record, "id"),
    nombre: parseDatoTexto(record.nombre),
    periodo: parsePeriodo(record.periodo),
    estructura: parseDatoPublico(record.estructura),
    fechaSeguridad: parseDatoTexto(record.fechaSeguridad),
    etapas: record.etapas.map(parseEtapa),
    secciones,
  };
}

export const temporadaPublica = parseTemporadaPublica(temporadaVersionada);

export function obtenerEvento(slug: string): EtapaPublica | undefined {
  return temporadaPublica.etapas.find((etapa) => etapa.slug === slug);
}

export function obtenerSeccion(slug: string): SeccionPublica {
  const seccion = temporadaPublica.secciones[slug];
  if (seccion === undefined) {
    throw new RangeError(`No existe la sección pública: ${slug}`);
  }
  return seccion;
}

export function valorPublicado<T extends JsonValue>(
  dato: DatoPublico<T>,
): T | undefined {
  return dato.publicacion === "autorizada" ? dato.valor : undefined;
}
