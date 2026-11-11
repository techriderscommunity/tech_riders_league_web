import type { Metadata } from "next";

export function metadataPagina(
  titulo: string,
  descripcion: string,
  ruta: string,
  indexable = true,
): Metadata {
  const sitio = process.env.NEXT_PUBLIC_SITE_URL;
  let base: URL | undefined;
  if (sitio !== undefined) {
    let url: URL;
    try {
      url = new URL(sitio);
    } catch {
      throw new TypeError("NEXT_PUBLIC_SITE_URL debe ser una URL válida.");
    }
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      throw new TypeError(
        "NEXT_PUBLIC_SITE_URL debe usar HTTPS fuera de localhost.",
      );
    }
    base = url;
  }

  return {
    title: titulo,
    description: descripcion,
    robots: { index: indexable, follow: indexable },
    ...(base === undefined
      ? {}
      : {
          alternates: { canonical: new URL(ruta, base) },
          openGraph: {
            title: titulo,
            description: descripcion,
            url: new URL(ruta, base),
            siteName: "Tech Riders League",
            type: "website",
          },
        }),
  };
}
