import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { metadataPagina } from "../src/lib/metadata.ts";

const leer = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("el layout ofrece navegación semántica y salto al contenido", () => {
  const layout = leer("../src/app/layout.tsx");
  const navigation = leer("../src/components/navegacion.tsx");
  assert.match(layout, /<html lang="es">/);
  assert.match(layout, /href="#contenido"/);
  assert.match(layout, /<main id="contenido">/);
  assert.match(navigation, /aria-label="Navegación principal"/);
  assert.doesNotMatch(layout, /Los contenidos pendientes se publicarán/);
  assert.match(layout, /<address>Tajamar · Calle Pío Felipe, 12 · 28038 Madrid<\/address>/);
  assert.match(layout, /https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
  assert.match(layout, /Cómo llegar/);
  assert.match(layout, /href="\/codigo-de-conducta">Código de Conducta<\/Link>/);
  assert.doesNotMatch(navigation, /<details|Inicio|La League|Hackathon/);
  for (const route of [
    "/eventos",
    "/clasificacion",
    "/participacion",
    "/colaboradores",
  ]) {
    assert.ok(navigation.includes(route), `Falta el enlace ${route}`);
    assert.ok(layout.includes(route), `El pie no ofrece el enlace ${route}`);
  }
});

test("el código de conducta conserva el texto y contacto aportados", () => {
  const pagina = leer("../src/app/codigo-de-conducta/page.tsx");
  for (const titulo of [
    "Una League para todo el mundo", "Lo que esperamos de ti",
    "Lo que no tendrá cabida", "Fotos, vídeo y grabaciones", "Si ocurre algo",
    "Cómo actuaremos", "Esto también forma parte de la League", "Contacto",
  ]) {
    assert.ok(pagina.includes(`<h2>${titulo}</h2>`), `Falta ${titulo}`);
  }
  assert.match(pagina, /no desea aparecer/);
  assert.match(pagina, /inmunidad \+10/);
  assert.match(pagina, /href="mailto:techriders@tajamar365.com"/);
  assert.match(pagina, /Código de Conducta para Eventos de GitHub/);
  assert.equal((pagina.match(/<h1>/g) ?? []).length, 1);
});

test("acceso muestra login y registro/recuperación en diálogos con un solo correo de recuperación", () => {
  const acceso = leer("../src/components/access-content.tsx");
  const pagina = leer("../src/app/acceso/page.tsx");
  const navigation = leer("../src/components/navegacion.tsx");
  const dialog = leer("../src/components/access-dialog.tsx");
  assert.match(navigation, /<AccessDialog label="Iniciar sesión" title="Accede a la League" navigation>/);
  assert.match(navigation, /<AccessContent \/>/);
  assert.match(pagina, /<AccessContent params=\{params\} \/>/);
  assert.match(acceso, /activation \? \(/);
  assert.match(navigation, /Cerrar sesión/);
  assert.match(dialog, /aria-haspopup="dialog"/);
  assert.match(acceso, /AccessDialog label="¿No tienes cuenta\? Regístrate"/);
  assert.match(acceso, /AccessDialog label="¿Has olvidado tu contraseña\?"/);
  assert.doesNotMatch(acceso, /action="verify-mail"/);
  const recuperacion = acceso.slice(acceso.indexOf('<AccessDialog label="¿Has olvidado'));
  assert.equal((recuperacion.match(/<input /g) ?? []).length, 1);
  assert.match(recuperacion, /action="reset"/);
  assert.match(dialog, /showModal\(\)/);
  assert.match(dialog, /aria-labelledby=\{titleId\}/);
});

test("los estilos mantienen foco visible, reflow móvil y movimiento reducido", () => {
  const css = leer("../src/app/globals.css");
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.site-header\s*\{[^}]*position: sticky;[^}]*top: 0;/);
  assert.match(css, /scroll-padding-top:/);
  assert.match(css, /@media \(max-width: 40rem\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /--cyan:/);
  assert.doesNotMatch(css, /min-width:\s*20rem/);
  assert.doesNotMatch(css, /position:\s*fixed/);
});

test("la Home reserva seis personajes interactivos fuera del menú", () => {
  const navigation = leer("../src/components/navegacion.tsx");
  const personajes = leer("../src/components/personajes-aventura.tsx");
  const home = leer("../src/components/home-priorizada.tsx");
  assert.doesNotMatch(navigation, /PersonajesCabecera|PersonajesAventura/);
  assert.match(home, /<PersonajesAventura \/>/);
  assert.match(personajes, /src="\/images\/banner-home\.png"/);
  assert.match(personajes, /href="\/participacion" aria-label="Comenzar la aventura"/);
  for (const nombre of ["Techito", "Codechito", "Guarandinchito"]) {
    assert.ok(personajes.includes(`nombre: "${nombre}"`));
  }
  assert.match(personajes, /\[4, 5, 6\]\.map/);
  assert.match(personajes, /aria-expanded=/);
  assert.match(personajes, /aria-controls=/);
  assert.match(personajes, /hidden=\{abierto !== indice\}/);
  assert.match(personajes, /onMouseEnter=/);
  assert.match(personajes, /onFocus=/);
  assert.match(personajes, /onClick=/);
  assert.match(personajes, /event.key === "Escape"/);
  assert.match(personajes, /Se revelarán con este personaje/);
});

test("las fichas muestran nombre y papel antes de la foto, sin scroll interno", () => {
  const personajes = leer("../src/components/personajes-aventura.tsx");
  const css = leer("../src/components/personajes-aventura.module.css");
  const encabezado = personajes.indexOf("<h2>");
  const papel = personajes.indexOf("<p>{personaje.rol}</p>");
  const retrato = personajes.indexOf("<Image className={styles.retrato}");
  const habilidades = personajes.indexOf("<h3>Habilidades</h3>");
  assert.ok(encabezado > -1 && encabezado < papel && papel < retrato && retrato < habilidades);
  assert.doesNotMatch(personajes, /PERSONAJE \{|styles\.etiqueta/);
  assert.doesNotMatch(css, /max-height:|overflow:\s*(auto|scroll)/);
});

test("las fichas se colocan dentro del viewport y se actualizan al desplazar o redimensionar", () => {
  const personajes = leer("../src/components/personajes-aventura.tsx");
  const css = leer("../src/components/personajes-aventura.module.css");
  assert.match(personajes, /popover="manual"/);
  assert.match(personajes, /panel\.showPopover\(\)/);
  assert.match(personajes, /window\.visualViewport/);
  assert.match(personajes, /Math\.min\(preferido, abajo - ficha\.height\)/);
  assert.match(personajes, /derecha - ficha\.width/);
  assert.match(personajes, /new ResizeObserver\(colocar\)/);
  for (const evento of ["resize", "scroll"]) {
    assert.ok(personajes.includes(`addEventListener("${evento}", colocar`));
    assert.ok(personajes.includes(`removeEventListener("${evento}", colocar`));
  }
  assert.match(css, /\.desplegable\s*\{[^}]*position: fixed;/);
  assert.match(css, /height: clamp\(3rem, calc\(100dvh - 16rem\), 10rem\)/);
});

test("los metadatos omiten URL inventada y no indexan contenido no autorizado", () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  try {
    const metadata = metadataPagina("Speakers", "Contenido pendiente", "/speakers", false);
    assert.deepEqual(metadata.robots, { index: false, follow: false });
    assert.equal(metadata.alternates, undefined);
    assert.equal(metadata.openGraph, undefined);
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previous;
    }
  }
});
