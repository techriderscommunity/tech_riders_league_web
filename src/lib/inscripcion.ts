export const eventosInscripcion = [
  { clave: "negocio-arquitectura", nombre: "Mundo 1 · Negocio y Arquitectura", url: "https://luma.com/se51f6w7" },
  { clave: "datos", nombre: "Mundo 2 · Datos", url: "https://luma.com/mrz3btsx" },
  { clave: "cloud", nombre: "Mundo 3 · Cloud", url: "https://luma.com/j72zgw6e" },
  { clave: "seguridad", nombre: "Mundo 4 · Ciberseguridad", url: "https://luma.com/pagd2wd1" },
  { clave: "hackathon", nombre: "Mundo final · Hackathon", url: "https://luma.com/gg7e7g5o" },
] as const;

export function obtenerInscripcionMundo(clave: string) {
  const evento = eventosInscripcion.find((evento) => evento.clave === clave);
  if (!evento) throw new RangeError(`No hay inscripción para el mundo ${clave}.`);
  return evento;
}
