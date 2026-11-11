import type { ReactNode } from "react";
import type { DatoPublico, JsonValue } from "../lib/contenido";

const etiquetasEstado: Record<DatoPublico["estado"], string> = {
  confirmado: "Confirmado",
  pendiente: "Pendiente",
  parcial: "Parcial",
  bloqueado: "Bloqueado",
  "en-edicion": "En edición",
  "temporalmente-no-disponible": "Temporalmente no disponible",
};

const etiquetasPropiedad: Readonly<Record<string, string>> = {
  inicio: "Inicio",
  fin: "Fin",
  etapas: "Etapas",
  descripcion: "Descripción",
};

function etiquetaPropiedad(key: string): string {
  return (
    etiquetasPropiedad[key] ??
    key
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]/g, " ")
      .replace(/^\w/, (letter) => letter.toLocaleUpperCase("es-ES"))
  );
}

function ValorPublico({ value }: { value: JsonValue }): ReactNode {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "Sin contenido.";
  }
  if (Array.isArray(value)) {
    return (
      <ul className="value-list">
        {value.map((item, index) => (
          <li key={index}>
            <ValorPublico value={item} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="value-object">
      {Object.entries(value).map(([key, item]) => (
        <div key={key}>
          <dt>{etiquetaPropiedad(key)}</dt>
          <dd>
            <ValorPublico value={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function EstadoPublico({
  dato,
  titulo,
}: {
  dato: DatoPublico;
  titulo?: string;
}) {
  return (
    <div className={`public-status status-${dato.estado}`}>
      {titulo === undefined ? null : <h3>{titulo}</h3>}
      <p className="status-label">{etiquetasEstado[dato.estado]}</p>
      {dato.publicacion === "autorizada" ? (
        <div className="public-value">
          <ValorPublico value={dato.valor} />
        </div>
      ) : (
        <p>{dato.mensaje}</p>
      )}
      {dato.publicacion === "autorizada" && dato.mensaje !== undefined ? (
        <p className="status-note">{dato.mensaje}</p>
      ) : null}
    </div>
  );
}
