import Image from "next/image";

const ilustraciones = {
  1: {
    src: "/images/Tech%20Riders%20League%20I.png",
    alt: "Un oso y jóvenes exploran un mundo ilustrado de ideas y arquitectura.",
  },
  2: {
    src: "/images/Tech%20Riders%20League%20II.png",
    alt: "Un oso y jóvenes exploran visualizaciones, gráficos y entornos de datos.",
  },
  3: {
    src: "/images/Tech%20Riders%20League%20III.png",
    alt: "Un oso y jóvenes exploran un mundo ilustrado de servicios cloud.",
  },
  4: {
    src: "/images/Tech%20Riders%20League%20IV.png",
    alt: "Un oso y jóvenes protegen un mundo ilustrado de ciberseguridad.",
  },
  5: {
    src: "/images/Tech%20Riders%20League%20Final.png",
    alt: "Un oso y jóvenes celebran la final tecnológica con un trofeo.",
  },
} as const;

export type NumeroEtapa = keyof typeof ilustraciones;

const numeroPorSlug: Readonly<Record<string, NumeroEtapa>> = {
  "negocio-arquitectura": 1,
  datos: 2,
  cloud: 3,
  seguridad: 4,
};

export function numeroIlustracionEvento(
  slug: string,
): NumeroEtapa | undefined {
  return numeroPorSlug[slug];
}

export function EventoIlustracion({
  numero,
  clase,
  prioridad = false,
}: {
  numero: NumeroEtapa;
  clase: string;
  prioridad?: boolean;
}) {
  const ilustracion = ilustraciones[numero];
  return (
    <figure className={`event-artwork ${clase}`}>
      <Image
        src={ilustracion.src}
        alt={ilustracion.alt}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 1100px"
        priority={prioridad}
      />
    </figure>
  );
}
