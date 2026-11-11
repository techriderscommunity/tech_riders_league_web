import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const assets = [
  "Tech Riders League I.png",
  "Tech Riders League II.png",
  "Tech Riders League III.png",
  "Tech Riders League IV.png",
  "Tech Riders League Final.png",
];

const leer = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("las cinco ilustraciones originales están disponibles para el sitio", () => {
  const component = leer("../src/components/evento-ilustracion.tsx");
  for (const asset of assets) {
    const path = new URL(`../public/images/${asset}`, import.meta.url);
    const image = readFileSync(path);
    assert.ok(image.length > 0, `${asset} está vacío`);
    assert.equal(image.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(statSync(path).size, image.length);
    assert.ok(
      component.includes(encodeURIComponent(asset)),
      `${asset} no tiene referencia en el componente`,
    );
  }
});

test("los logos de las organizaciones están disponibles y tienen referencias explícitas", () => {
  const component = leer("../src/components/imagen-organizacion.tsx");
  for (const [name, asset] of [
    ["Guarandinga", "GuarandingaTech.png"],
    ["SirviendoCodigo", "SirviendoCodigo.png"],
  ] as const) {
    const path = new URL(`../public/images/${asset}`, import.meta.url);
    const image = readFileSync(path);
    assert.ok(image.length > 0, `${asset} está vacío`);
    assert.equal(image.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.ok(component.includes(`${name}:`), `${name} no está asociado`);
    assert.ok(component.includes(asset), `${asset} no está asociado`);
  }
});

test("el mapa de Home conserva el arte numerado para las cinco etapas", () => {
  const home = leer("../src/components/home-priorizada.tsx");
  const component = leer("../src/components/evento-ilustracion.tsx");
  const sections = leer("../src/components/pagina-seccion.tsx");
  const globalStyles = leer("../src/app/globals.css");
  const homeStyles = leer("../src/components/home-priorizada.module.css");
  assert.match(home, /numeroIlustracionEvento\(etapa\.slug\)/);
  assert.match(component, /"negocio-arquitectura": 1/);
  assert.match(component, /datos: 2/);
  assert.match(component, /cloud: 3/);
  assert.match(component, /seguridad: 4/);
  assert.match(component, /4:\s*\{/);
  assert.match(component, /5:\s*\{/);
  assert.match(sections, /numero=\{5\}/);
  assert.match(globalStyles, /\.event-artwork img\s*\{\s*object-fit:\s*contain;/);
  assert.match(globalStyles, /\.event-card-artwork\s*\{\s*aspect-ratio:\s*1;/);
  assert.match(homeStyles, /\.stageArtwork\s*\{[^}]*aspect-ratio:\s*1;/);
  assert.match(homeStyles, /\.stage h3\s*\{[^}]*color:\s*#fff;/);
});

test("SirviendoCodigo aparece como responsable de grabación, no como organización", () => {
  const communities = leer("../src/app/comunidades/page.tsx");
  const content = leer("../content/temporada.json");
  const map = leer("../src/app/eventos/page.tsx");
  const home = leer("../src/components/home-priorizada.tsx");
  assert.match(communities, /Grabará todas las sesiones y otros contenidos/);
  assert.match(communities, /Organización principal/);
  assert.match(communities, /Guarandinga/);
  assert.match(communities, /Mundo 1 · Negocio y Arquitectura/);
  assert.match(map, /Guarandinchito/);
  assert.match(map, /imagen-organizacion/);
  assert.match(map, /El Reino de las Decisiones/);
  assert.doesNotMatch(home, /Guarandinchito/);
  assert.match(map, /Mundo final/);
  assert.match(map, /Mundo \$\{parada\.numero\}/);
  assert.doesNotMatch(content, /SirviendoCodigo también organiza/);
  assert.doesNotMatch(content, /Guarandinga está confirmada como anfitriona de Cloud/);
});
