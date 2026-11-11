import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { obtenerSeccion } from "../src/lib/contenido.ts";
import { calcularClasificacion } from "../src/lib/clasificacion.ts";

test("la clasificación incluye solo resultados validados y conserva los empates", () => {
  assert.deepEqual(
    calcularClasificacion([
      { equipo: "Equipo B", puntos: 100, validado: true },
      { equipo: "Equipo A", puntos: 100, validado: true },
      { equipo: "Pendiente", puntos: 500, validado: false },
      { equipo: "Sin puntos válidos", puntos: -1, validado: true },
      { equipo: "   ", puntos: 40, validado: true },
      { equipo: "Equipo C", puntos: 50, validado: true },
    ]),
    [
      { equipo: "Equipo B", puntos: 100, posicion: 1 },
      { equipo: "Equipo A", puntos: 100, posicion: 1 },
      { equipo: "Equipo C", puntos: 50, posicion: 3 },
    ],
  );
});

test("los equipos comparten las reglas autorizadas de continuidad de temporada", () => {
  const equipos = obtenerSeccion("equipos");
  assert.equal(equipos.contenido.publicacion, "autorizada");
  if (equipos.contenido.publicacion !== "autorizada") assert.fail("Reglas sin publicar");
  assert.deepEqual(equipos.contenido.valor, [
    "Participar en al menos 3 de los 4 eventos.",
    "Mantener al menos 3 de los 4 integrantes originales.",
    "Utilizar el mismo nombre durante toda la temporada.",
    "Designar un capitán, encargado de las comunicaciones y de las entregas.",
  ]);
  assert.equal(equipos.datosAdicionales.directorio.publicacion, "no-autorizada");
  const componente = readFileSync(new URL("../src/components/equipos-temporada.tsx", import.meta.url), "utf8");
  assert.match(componente, /contenido\.valor\.map/);
  assert.match(componente, /integrantes<br \/>por equipo/);
  assert.match(componente, /src="\/images\/equipos-temporada\.png"/);
  assert.doesNotMatch(componente, /PixelAvatar/);
  const pagina = readFileSync(new URL("../src/app/equipos/page.tsx", import.meta.url), "utf8");
  assert.match(pagina, /<EquiposTemporada \/>/);
});

test("la clasificación y participación conservan sus estados pendientes", () => {
  const clasificacion = obtenerSeccion("clasificacion");
  const participacion = obtenerSeccion("participacion");
  assert.equal(clasificacion.contenido.publicacion, "no-autorizada");
  assert.equal(clasificacion.datosAdicionales.desempates.estado, "pendiente");
  assert.equal(participacion.contenido.estado, "bloqueado");

  const participacionPage = readFileSync(
    new URL("../src/app/participacion/page.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(participacionPage, /<form|<input|action=/i);
  assert.match(participacionPage, /id="inscripcion"/);
  assert.match(participacionPage, /<button type="button" disabled aria-describedby="inscripcion-proximamente">Registrar equipo<\/button>/);
  assert.match(participacionPage, /<p id="inscripcion-proximamente">Próximamente<\/p>/);
  assert.doesNotMatch(participacionPage, /Quiero apuntarme|En qué consiste la League|className="page-heading"/);
  assert.match(participacionPage, /<h1 className="sr-only">Cómo participar<\/h1>/);
  assert.match(participacionPage, /<EquiposTemporada \/>/);
  for (const texto of ["Misión 01", "Misión 02", "Misión 03", "validación será manual", "eventosInscripcion.map", "Objetivo:", "Al completarla:"]) {
    assert.ok(participacionPage.includes(texto));
  }
  assert.doesNotMatch(participacionPage, /Estado de participación|Cuando se aprueben el proceso/);
  assert.ok(participacionPage.indexOf('id="inscripcion"') < participacionPage.indexOf('id="reglamento"'));

  const resultadosPage = readFileSync(
    new URL("../src/app/clasificacion/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(resultadosPage, /id="global"/);
  assert.match(resultadosPage, /id="por-evento"/);
  assert.doesNotMatch(resultadosPage, /id="puntuacion"/);
  assert.match(participacionPage, /id="puntuacion"/);
  assert.ok(participacionPage.indexOf("<EquiposTemporada />") < participacionPage.indexOf('id="puntuacion"'));
  const redireccion = readFileSync(new URL("../src/app/puntuacion/page.tsx", import.meta.url), "utf8");
  assert.match(redireccion, /redirect\("\/participacion#puntuacion"\)/);
  assert.match(resultadosPage, /id="premios"/);

  const colaboradoresPage = readFileSync(
    new URL("../src/app/colaboradores/page.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(
    colaboradoresPage.indexOf('aria-labelledby="sponsors-actuales"') <
      colaboradoresPage.indexOf('className="sponsor-cta"'),
  );
  assert.ok(
    colaboradoresPage.indexOf('id="ser-sponsor"') <
      colaboradoresPage.indexOf('aria-labelledby="sponsors-actuales"'),
  );
  assert.match(colaboradoresPage, /href="mailto:techriders@tajamar365\.com"/);
  for (const texto of [
    "Haz posible la aventura", "Sponsor Global", "Sponsor de Evento",
    "Sponsor Hackathon", "100 y 150 asistentes esperados", "400 personas",
    "stand propio", "con transparencia", "A qué se destinarán las aportaciones",
  ]) {
    assert.ok(colaboradoresPage.includes(texto), `Falta el contenido de colaboración: ${texto}`);
  }
  assert.doesNotMatch(colaboradoresPage, /próxima edición|se anunciarán cuando|contribuir en especie|valor real de la aportación/);
  const estilosColabora = readFileSync(new URL("../src/app/colaboradores/colaboradores.module.css", import.meta.url), "utf8");
  assert.match(estilosColabora, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(estilosColabora, /@media \(max-width: 50rem\)/);
});

test("el marcador retro reserva diez plazas globales y tres por mundo sin inventar resultados", () => {
  const pagina = readFileSync(
    new URL("../src/app/clasificacion/page.tsx", import.meta.url),
    "utf8",
  );
  const estilos = readFileSync(
    new URL("../src/app/clasificacion/clasificacion.module.css", import.meta.url),
    "utf8",
  );
  assert.match(pagina, /<PuestosPendientes limite=\{7\} inicio=\{4\} ranking=\{global\}/);
  assert.match(pagina, /<PuestosPendientes limite=\{3\} ranking=/);
  assert.match(pagina, /recorrido\.map/);
  assert.match(pagina, /"Hackathon final"/);
  assert.doesNotMatch(pagina, /Explorar mundo|Descubre la final|High scores|Estado de la clasificación/);
  assert.match(pagina, /\[2, 1, 3\]\.map/);
  assert.match(pagina, /<BanderaAventura \/>/);
  assert.match(pagina, /className=\{styles.templeFloor\} aria-hidden="true"/);
  assert.match(estilos, /\.stairs\s*\{/);
  assert.match(estilos, /\.sanctuary\s*\{/);
  assert.match(pagina, /Todavía no hay equipos en el podio/);
  assert.match(pagina, /Plazas sin asignar · Resultados pendientes de validación/);
  assert.match(pagina, /aria-label="Sin puntuación"/);
  assert.match(pagina, /scope="col"/);
  assert.match(pagina, /scope="row"/);
  assert.match(pagina, /src="\/images\/clasificacion-mundos\.png"/);
  assert.doesNotMatch(pagina, /styles\.globalBoard|styles\.eventGrid/);
  assert.match(pagina, /indice \+ inicio/);
  assert.ok(pagina.indexOf("styles.templeFloor") < pagina.indexOf("<PuestosPendientes limite={7}"));
  for (let mundo = 1; mundo <= 5; mundo++) {
    assert.ok(estilos.includes(`.eventBoard[data-world="${mundo}"]`));
  }
});

test("puntuación y premios incluyen los importes y vouchers autorizados sin premios de evento inventados", () => {
  const pagina = readFileSync(
    new URL("../src/app/clasificacion/page.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(pagina, /Criterios de desempate|Reconocimientos adicionales|Premios y reconocimientos/);
  const participacion = readFileSync(new URL("../src/app/participacion/page.tsx", import.meta.url), "utf8");
  assert.match(participacion, /Foto de equipo etiquetando comunidades y sponsors/);
  assert.match(participacion, /\["1.º equipo válido", "100"\]/);
  assert.match(participacion, /\["2.º equipo válido", "75"\]/);
  assert.match(participacion, /\["3.º equipo válido", "50"\]/);
  assert.match(pagina, /Pendientes de sponsor/);
  assert.match(pagina, /\["1.º clasificado", "750 €"\]/);
  assert.match(pagina, /\["2.º clasificado", "500 €"\]/);
  assert.match(pagina, /\["3.º clasificado", "250 €"\]/);
  assert.match(pagina, /Sorteo de 30 vouchers Fundamentals/);
  assert.match(pagina, /5 por cada mundo/);
  assert.match(pagina, /10 en el hackathon final/);
  assert.doesNotMatch(pagina, /Distribución de vouchers/);
  assert.equal(obtenerSeccion("premios").contenido.publicacion, "autorizada");
});
