import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseDatoPublico,
  valorPublicado,
  type DatoPublico,
} from "../src/lib/contenido.ts";

function esObjeto(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function leerDato(
  temporada: Record<string, unknown>,
  key: string,
): DatoPublico {
  return parseDatoPublico(temporada[key]);
}

const contenido = JSON.parse(
  readFileSync(new URL("../content/temporada.json", import.meta.url), "utf8"),
) as unknown;

test("el contenido versionado representa estados explícitos sin inventar datos", () => {
  assert.ok(esObjeto(contenido));

  const temporada = contenido;
  const nombre = leerDato(temporada, "nombre");
  const periodo = leerDato(temporada, "periodo");
  const estructura = leerDato(temporada, "estructura");
  const fechaSeguridad = leerDato(temporada, "fechaSeguridad");
  const comunidades = leerDato(temporada, "comunidadesAnfitrionasPendientes");
  const participacion = leerDato(temporada, "participacion");
  const reglamento = leerDato(temporada, "reglamento");
  const agenda = leerDato(temporada, "agenda");
  const noDisponible = leerDato(
    temporada,
    "contenidoTemporalmenteNoDisponible",
  );

  assert.equal(valorPublicado(nombre), "Tech Riders League 2027");
  assert.deepEqual(valorPublicado(periodo), {
    inicio: "2027-01",
    fin: "2027-05",
  });
  assert.deepEqual(valorPublicado(estructura), {
    etapas: 5,
    descripcion: "Cuatro eventos temáticos y un hackathon final.",
  });
  assert.equal(fechaSeguridad.estado, "pendiente");
  assert.equal(valorPublicado(fechaSeguridad), "2027-04-10");
  assert.equal(comunidades.estado, "pendiente");
  assert.equal(valorPublicado(comunidades), undefined);
  assert.equal(participacion.estado, "bloqueado");
  assert.equal(valorPublicado(participacion), undefined);
  assert.equal(reglamento.estado, "pendiente");
  assert.equal(valorPublicado(reglamento), undefined);
  assert.equal(agenda.estado, "en-edicion");
  assert.equal(valorPublicado(agenda), undefined);
  assert.equal(noDisponible.estado, "temporalmente-no-disponible");
  assert.equal(valorPublicado(noDisponible), undefined);
});

test("permite valores parciales solo cuando su publicación está autorizada", () => {
  const partial = parseDatoPublico({
    estado: "parcial",
    publicacion: "autorizada",
    valor: { titulo: "Agenda", sesiones: [] },
    mensaje: "La agenda todavía está incompleta.",
  });

  assert.equal(partial.estado, "parcial");
  assert.deepEqual(valorPublicado(partial), {
    titulo: "Agenda",
    sesiones: [],
  });
});

test("rechaza datos no autorizados y combinaciones incoherentes", () => {
  const invalidRecords: unknown[] = [
    {
      estado: "pendiente",
      publicacion: "no-autorizada",
      valor: "dato no confirmado",
      mensaje: "Pendiente.",
    },
    {
      estado: "confirmado",
      publicacion: "no-autorizada",
      mensaje: "Pendiente.",
    },
    {
      estado: "bloqueado",
      publicacion: "autorizada",
      valor: "contenido oculto",
    },
    {
      estado: "confirmado",
      publicacion: "autorizada",
      mensaje: "Falta el valor.",
    },
    {
      estado: "pendiente",
      publicacion: "no-autorizada",
      mensaje: "   ",
    },
    {
      estado: "confirmado",
      publicacion: "autorizada",
      valor: Number.NaN,
    },
  ];

  for (const invalidRecord of invalidRecords) {
    assert.throws(() => parseDatoPublico(invalidRecord), TypeError);
  }
});

test("rechaza claves extra que podrían filtrar contenido no revisado", () => {
  assert.throws(
    () =>
      parseDatoPublico({
        estado: "confirmado",
        publicacion: "autorizada",
        valor: "Título",
        datosPersonales: ["nombre no autorizado"],
      }),
    /Clave no permitida/,
  );
});

test("rechaza valores que no pertenecen al formato JSON", () => {
  const circular: { self?: unknown } = {};
  circular.self = circular;

  assert.throws(
    () =>
      parseDatoPublico({
        estado: "confirmado",
        publicacion: "autorizada",
        valor: circular,
      }),
    /valor JSON válido/,
  );
});
