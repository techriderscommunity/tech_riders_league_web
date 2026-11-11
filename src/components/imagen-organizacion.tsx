import Image from "next/image";

const imagenes = {
  Guarandinga: {
    src: "/images/GuarandingaTech.png",
    alt: "Guarandinga Tech en un mundo ilustrado de tecnología.",
  },
  SirviendoCodigo: {
    src: "/images/SirviendoCodigo.png",
    alt: "SirviendoCodigo en un mundo ilustrado de tecnología.",
  },
} as const;

type OrganizacionConImagen = keyof typeof imagenes;

function tieneImagen(nombre: string): nombre is OrganizacionConImagen {
  return Object.hasOwn(imagenes, nombre);
}

export function ImagenOrganizacion({
  nombre,
  clase,
  prioridad = false,
}: {
  nombre: string;
  clase: string;
  prioridad?: boolean;
}) {
  if (!tieneImagen(nombre)) {
    return null;
  }
  const imagen = imagenes[nombre];

  return (
    <Image
      className={clase}
      src={imagen.src}
      alt={imagen.alt}
      width={480}
      height={320}
      sizes={
        clase === "world-guide-image"
          ? "(max-width: 640px) 256px, 384px"
          : "(max-width: 640px) 50vw, 240px"
      }
      priority={prioridad}
    />
  );
}
