import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { eventosInscripcion, obtenerInscripcionMundo } from "../src/lib/inscripcion.ts";
import {
  obtenerEvento,
  temporadaPublica,
  valorPublicado,
} from "../src/lib/contenido.ts";

test("la Home y el mapa usan la fuente versionada y la temporada redirige al recorrido", () => {
  assert.equal(temporadaPublica.id, "tech-riders-league-2027");
  assert.equal(
    valorPublicado(temporadaPublica.nombre),
    "Tech Riders League 2027",
  );
  assert.equal(temporadaPublica.etapas.length, 4);

  const home = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  const temporada = readFileSync(
    new URL("../src/app/temporada/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(home, /HomePriorizada/);
  assert.match(temporada, /redirect\("\/eventos"\)/);
});

test("las etapas mantienen los estados reales de fecha y comunidad", () => {
  const seguridad = obtenerEvento("seguridad");
  assert.ok(seguridad);
  assert.equal(seguridad.fecha.estado, "pendiente");
  assert.equal(valorPublicado(seguridad.fecha), "2027-04-10");
  assert.equal(seguridad.comunidad.publicacion, "no-autorizada");

  const primerMundo = obtenerEvento("negocio-arquitectura");
  assert.ok(primerMundo);
  assert.equal(primerMundo.comunidad.publicacion, "autorizada");
  assert.equal(valorPublicado(primerMundo.comunidad), "Guarandinga");

  const datos = obtenerEvento("datos");
  assert.ok(datos);
  assert.equal(valorPublicado(datos.nombre), "Datos");
  assert.equal(datos.comunidad.publicacion, "no-autorizada");

  const cloud = obtenerEvento("cloud");
  assert.ok(cloud);
  assert.equal(cloud.comunidad.publicacion, "no-autorizada");
  assert.equal(cloud.fecha.publicacion, "no-autorizada");
});

test("el mapa permite seleccionar cinco paradas y mantiene los detalles en una página", () => {
  const listado = readFileSync(
    new URL("../src/app/eventos/page.tsx", import.meta.url),
    "utf8",
  );
  const detalle = readFileSync(
    new URL("../src/app/eventos/[slug]/page.tsx", import.meta.url),
    "utf8",
  );
  const hackathon = readFileSync(
    new URL("../src/app/hackathon/page.tsx", import.meta.url),
    "utf8",
  );
  const clasificacion = readFileSync(
    new URL("../src/app/clasificacion/page.tsx", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(
    new URL("../src/app/globals.css", import.meta.url),
    "utf8",
  );
  const mapa = readFileSync(
    new URL("../src/components/mapa-aventura.tsx", import.meta.url),
    "utf8",
  );
  assert.match(listado, /obtenerRecorridoHome\(\)/);
  assert.match(listado, /<MapaAventura/);
  assert.match(mapa, /className=\{styles.worlds\}/);
  assert.match(mapa, /aria-current=\{seleccion === mundo\.clave \? "step" : undefined\}/);
  assert.match(listado, /id="detalle-etapa"/);
  assert.match(listado, /etapa === undefined/);
  assert.match(listado, /Mundo final/);
  assert.match(listado, /Mundo \$\{parada\.numero\}/);
  assert.match(listado, /className="event-meta"/);
  assert.match(listado, /className="world-guide"/);
  assert.match(listado, /className="adventure-detail-intro"/);
  assert.match(
    styles,
    /\.adventure-detail-intro > \.event-artwork\s*\{[^}]*width: min\(100%, 9rem\)/,
  );
  assert.match(listado, /El Reino de las Decisiones/);
  assert.match(listado, /Fragmento de las Crónicas de Codechito/);
  assert.match(listado, /ningún microservicio ha resultado herido/);
  assert.match(listado, /Y los tres pondrán rumbo a su siguiente aventura/);
  assert.match(listado, /<h2 id="detalle-titulo">El Reino de las Decisiones<\/h2>/);
  assert.doesNotMatch(listado, /Capítulo I/);
  assert.match(listado, /Pendiente de confirmar/);
  assert.doesNotMatch(listado, /<EstadoPublico dato=\{paradaActiva\.etapa\.fecha\}/);
  assert.match(clasificacion, /Mundo \{numero\} · \{titulo\}/);
  assert.match(hackathon, /redirect\("\/eventos\?etapa=hackathon#detalle-etapa"\)/);
  assert.match(detalle, /redirect\(`\/eventos\?etapa=\$\{evento\.slug\}#detalle-etapa`\)/);
  assert.match(detalle, /notFound\(\)/);
});

test("el mapa resalta e invita a pulsar sin abrir el detalle al pasar el ratón", () => {
  const mapa = readFileSync(
    new URL("../src/components/mapa-aventura.tsx", import.meta.url),
    "utf8",
  );
  assert.match(mapa, /src="\/images\/Mapa%20League.png"/);
  assert.doesNotMatch(mapa, /IntersectionObserver|map-village|sendero/);
  assert.doesNotMatch(
    readFileSync(new URL("../src/app/eventos/page.tsx", import.meta.url), "utf8"),
    /className="page-heading"/,
  );
  assert.match(mapa, /href=\{`\/eventos\?etapa=\$\{mundo\.clave\}`\}/);
  assert.match(mapa, /scroll=\{false\}/);
  assert.doesNotMatch(mapa, /seleccionHover|onPointerMove|onPointerEnter|onMouseEnter/);
  assert.match(mapa, /Haz clic para explorar/);
  assert.match(mapa, /Haz clic en una isla/);
  const css = readFileSync(new URL("../src/components/mapa-aventura.module.css", import.meta.url), "utf8");
  assert.match(css, /\.hotspot:hover,/);
  assert.match(css, /\.hotspot:focus-visible/);
  assert.match(mapa, /<dialog/);
  assert.match(mapa, /aria-haspopup="dialog"/);
  assert.match(mapa, /aria-labelledby="detalle-titulo"/);
  assert.match(mapa, /dialog\.showModal\(\)/);
  assert.match(mapa, /onCancel=/);
  assert.match(mapa, /router\.replace\("\/eventos", \{ scroll: false \}\)/);
  assert.match(mapa, /href=\{mundoAbierto\.inscripcion\}/);
  assert.ok(mapa.indexOf("Inscríbete") < mapa.indexOf("Cerrar <span"));
});

test("los cinco mundos comparten los enlaces públicos de inscripción con Participación", () => {
  assert.deepEqual(eventosInscripcion.map(({ url }) => url), [
    "https://luma.com/se51f6w7", "https://luma.com/mrz3btsx",
    "https://luma.com/j72zgw6e", "https://luma.com/pagd2wd1", "https://luma.com/gg7e7g5o",
  ]);
  for (const evento of eventosInscripcion) {
    assert.equal(obtenerInscripcionMundo(evento.clave), evento);
    assert.doesNotMatch(evento.url, /\/manage\//);
  }
  assert.throws(() => obtenerInscripcionMundo("desconocido"), RangeError);
  const listado = readFileSync(new URL("../src/app/eventos/page.tsx", import.meta.url), "utf8");
  assert.match(listado, /inscripcion: obtenerInscripcionMundo\(parada\.clave\)\.url/);
});
