import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { obtenerRecorridoHome } from "../src/lib/home.ts";
import { temporadaPublica, valorPublicado } from "../src/lib/contenido.ts";

const leer = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("el recorrido de Home conserva el orden de los cuatro mundos y la final", () => {
  const recorrido = obtenerRecorridoHome();

  assert.equal(recorrido.length, 5);
  assert.deepEqual(
    recorrido.slice(0, 4).map(({ etapa }) =>
      etapa === undefined ? undefined : valorPublicado(etapa.nombre),
    ),
    ["Negocio y Arquitectura", "Datos", "Cloud", "Ciberseguridad"],
  );
  const primerMundo = recorrido[0].etapa;
  assert.ok(primerMundo);
  assert.equal(valorPublicado(primerMundo.comunidad), "Guarandinga");
  assert.equal(recorrido[4].etapa, undefined);
  assert.equal(temporadaPublica.etapas.length, 4);
});

test("la Home conserva los datos autorizados sin avisos de fecha ni próxima parada", () => {
  const home = leer("../src/components/home-priorizada.tsx");
  const participacion = temporadaPublica.secciones.participacion.contenido;
  const comunidades = temporadaPublica.secciones.comunidades.contenido;
  const seguridad = temporadaPublica.etapas.find(
    (etapa) => etapa.slug === "seguridad",
  );
  const comunidadesPublicadas = valorPublicado(comunidades);

  assert.equal(participacion.estado, "bloqueado");
  assert.equal(participacion.publicacion, "no-autorizada");
  assert.equal(comunidades.estado, "parcial");
  assert.ok(typeof comunidadesPublicadas === "string");
  assert.match(comunidadesPublicadas, /Guarandinga/);
  assert.match(comunidadesPublicadas, /Mundo 1/);
  assert.match(comunidadesPublicadas, /tres comunidades siguen pendientes/);
  assert.ok(seguridad);
  assert.equal(seguridad?.fecha.estado, "pendiente");
  assert.equal(valorPublicado(seguridad.fecha), "2027-04-10");
  assert.match(home, /href="\/participacion"/);
  assert.doesNotMatch(home, /<form\b|href="\/registro"/i);
  const pasos = home.slice(home.indexOf("const pasos ="), home.indexOf("const perfiles ="));
  const titulos = [...pasos.matchAll(/titulo: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(titulos, [
    "Apúntate y haz equipo",
    "Participa en los eventos",
    "Aprende",
    "Conoce gente",
    "Completa los retos",
    "Y sobre todo, ¡disfruta!",
  ]);
  assert.doesNotMatch(home, /fechaCompleta|avisoFecha|nextStop|próxima parada/i);
});

test("la Home sigue la referencia visual sin presentar contenido pendiente como confirmado", () => {
  const home = leer("../src/components/home-priorizada.tsx");
  const navigation = leer("../src/components/navegacion.tsx");
  const illustrations = leer("../src/components/league-illustrations.tsx");
  const styles = leer("../src/components/home-priorizada.module.css");

  assert.match(navigation, /\/images\/logo\.png/);
  assert.match(navigation, /Tech Riders League, inicio/);
  assert.match(navigation, /Mapa de la aventura/);
  assert.match(navigation, /<header className="site-header">/);
  assert.doesNotMatch(home, /className=\{styles\.(header|footer)\}/);
  assert.match(home, /El mapa de la aventura/);
  assert.match(home, /Cinco mundos/);
  assert.match(home, /Mundo final/);
  assert.match(home, /Mundo \$\{numero\}/);
  assert.doesNotMatch(home, /Guarandinchito/);
  assert.match(home, /aria-labelledby="participacion-titulo"/);
  assert.match(home, /<IconoPerfil tipo=\{perfil.icono\}/);
  assert.doesNotMatch(home, /PixelAvatar|styles\.heart/);
  for (const icono of ["brote", "herramientas", "brujula", "libro"]) {
    assert.ok(home.includes(`icono: "${icono}"`));
  }
  assert.ok(home.indexOf('id="mapa-aventura"') < home.indexOf('id="para-ti"'));
  assert.ok(
    home.indexOf('id="para-ti"') <
      home.indexOf('aria-labelledby="participacion-titulo"'),
  );
  assert.match(home, /Una League construida entre comunidades/);
  assert.match(home, /<SponsorsActuales \/>/);
  assert.doesNotMatch(home, /No hay sponsors|No hay colaboradores formalizados/);
  const sponsors = leer("../src/components/sponsors-actuales.tsx");
  assert.match(sponsors, /href="https:\/\/www\.tajamar\.es\/"/);
  assert.match(sponsors, /\/images\/tajamar-logo\.svg/);
  assert.equal(temporadaPublica.secciones.colaboradores.contenido.publicacion, "autorizada");
  assert.match(home, /"Comunidad pendiente"/);
  assert.match(home, /\/images\/guarandinga-logo\.jpg/);
  assert.match(home, /canal: "https:\/\/www\.youtube\.com\/@GuarandingaTECH"/);
  assert.match(home, /href=\{"canal" in comunidad \? comunidad\.canal/);
  assert.doesNotMatch(home, /Anfitriona confirmada/);
  assert.doesNotMatch(home, /Ver canal de YouTube/);
  assert.match(home, /href="https:\/\/sirviendocodigo\.com\/"/);
  assert.match(home, /src="\/images\/sirviendo-codigo-logo\.png"/);
  assert.doesNotMatch(home, /CommunityMark|¿Y más por confirmar|¡Te unes!/);
  assert.match(home, /"Hackathon final"/);
  assert.match(illustrations, /export function HeroIllustration/);
  assert.match(illustrations, /export function JourneyIsland/);
  assert.match(illustrations, /export function NextStopIllustration/);
  assert.match(home, /hackathon-final/);
  assert.match(styles, /radial-gradient/);
  assert.doesNotMatch(styles, /body:has\(\.home-page\) > header\.site-header/);
  assert.match(styles, /@media \(max-width: 44rem\)/);
  assert.match(styles, /@media \(max-width: 22rem\)/);
});

test("la página y las ilustraciones comparten un ancho máximo en pantallas grandes", () => {
  const personajes = leer("../src/components/personajes-aventura.module.css");
  const mapa = leer("../src/components/mapa-aventura.module.css");
  const ranking = leer("../src/app/clasificacion/clasificacion.module.css");
  const equipos = leer("../src/components/equipos-temporada.module.css");
  const global = leer("../src/app/globals.css");
  assert.match(global, /--page-max-width: 1600px;/);
  assert.match(leer("../src/components/home-priorizada.module.css"), /:global\(body:has\(\.home-page\) > main#contenido\)\s*\{[^}]*margin: 0 auto;/);
  assert.match(global, /main#contenido\s*\{[^}]*max-width: var\(--page-max-width\);/);
  assert.match(global, /\.site-header\s*\{[^}]*padding:[^;]*var\(--page-max-width\)/);
  for (const selector of ["footer-inner", "footer-legal"]) {
    assert.match(global, new RegExp(`\\.${selector}\\s*\\{[^}]*max-width: var\\(--page-max-width\\);`));
  }
  assert.match(personajes, /\.escena\s*\{[^}]*max-width: var\(--page-max-width\);[^}]*margin-inline: auto;/);
  assert.match(mapa, /\.viewport\s*\{[^}]*width: 100%;[^}]*max-width: var\(--page-max-width\);[^}]*margin-inline: auto;/);
  assert.match(ranking, /\.worldViewport\s*\{[^}]*width: 100%;[^}]*max-width: var\(--page-max-width\);[^}]*margin-inline: auto;/);
  assert.match(equipos, /\.ilustracion\s*\{[^}]*max-width: 446px;[^}]*margin-inline: auto;/);
  assert.match(global, /\.event-artwork\s*\{[^}]*max-width: 1254px;/);
  for (const [css, selector] of [
    [personajes, "banner"], [mapa, "artwork"], [ranking, "worldArtwork"], [equipos, "ilustracion"],
  ]) {
    assert.match(css, new RegExp(`\\.${selector}\\s*\\{[^}]*image-rendering: auto;`));
  }
  assert.match(leer("../src/components/personajes-aventura.tsx"), /sizes="\(max-width: 1600px\) 100vw, 1600px"/);
  assert.match(leer("../src/components/mapa-aventura.tsx"), /\(max-width: 1600px\) 100vw, 1600px/);
  assert.match(leer("../src/app/clasificacion/page.tsx"), /\(max-width: 1152px\) 1152px, \(max-width: 1600px\) 100vw, 1600px/);
});
