import type { EtapaPublica, JsonValue } from "./contenido.ts";
import { temporadaPublica } from "./contenido.ts";

export interface EtapaRecorridoHome {
  readonly numero: number;
  readonly etapa: EtapaPublica | undefined;
}

function esObjetoJson(
  value: JsonValue,
): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function obtenerRecorridoHome(): readonly EtapaRecorridoHome[] {
  const estructura = temporadaPublica.estructura;
  if (
    estructura.publicacion !== "autorizada" ||
    !esObjetoJson(estructura.valor) ||
    typeof estructura.valor.etapas !== "number" ||
    !Number.isInteger(estructura.valor.etapas) ||
    estructura.valor.etapas < temporadaPublica.etapas.length
  ) {
    throw new TypeError(
      "La estructura pública debe indicar un total de etapas válido.",
    );
  }

  return Array.from({ length: estructura.valor.etapas }, (_, index) => ({
    numero: index + 1,
    etapa: temporadaPublica.etapas[index],
  }));
}
