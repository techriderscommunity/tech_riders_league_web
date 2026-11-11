import type { Metadata } from "next";
import { HomePriorizada } from "../components/home-priorizada";
import { metadataPagina } from "../lib/metadata";

export const metadata: Metadata = metadataPagina(
  "Inicio",
  "Descubre la temporada tecnológica Tech Riders League 2027.",
  "/",
);

export default function HomePage() {
  return <HomePriorizada />;
}
