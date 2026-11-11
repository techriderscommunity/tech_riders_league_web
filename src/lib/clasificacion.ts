export interface ResultadoEquipo {
  readonly equipo: string;
  readonly puntos: number;
  readonly validado: boolean;
}

export interface PosicionEquipo {
  readonly equipo: string;
  readonly puntos: number;
  readonly posicion: number;
}

export function calcularClasificacion(
  resultados: readonly ResultadoEquipo[],
): readonly PosicionEquipo[] {
  const validados = resultados.filter(
    ({ equipo, puntos, validado }) =>
      validado &&
      equipo.trim().length > 0 &&
      Number.isSafeInteger(puntos) &&
      puntos >= 0,
  );
  const ordenados = [...validados].sort(
    (left, right) => right.puntos - left.puntos,
  );
  let posicion = 0;
  let puntosAnteriores: number | undefined;
  return ordenados.map((resultado, indice) => {
    if (resultado.puntos !== puntosAnteriores) {
      posicion = indice + 1;
      puntosAnteriores = resultado.puntos;
    }
    return {
      equipo: resultado.equipo,
      puntos: resultado.puntos,
      posicion,
    };
  });
}
