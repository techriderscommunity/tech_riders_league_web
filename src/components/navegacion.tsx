import Link from "next/link";
import Image from "next/image";
import { AccessDialog } from "./access-dialog";
import { AccessContent } from "./access-content";
import { cookies } from "next/headers";
import { sessionUser } from "../lib/management/service";
import { ManagementForm } from "./management-form";

const enlaces = [
  ["Mapa de la aventura", "/eventos"],
  ["Cómo participar", "/participacion"],
  ["Clasificación y premios", "/clasificacion"],
  ["Colabora", "/colaboradores"],
] as const;

export async function Navegacion() {
  const store = await cookies();
  const session = store.get(process.env.NODE_ENV === "production" ? "__Host-league-session" : "league-session")?.value;
  const user = session ? await sessionUser(session) : undefined;
  return (
    <header className="site-header">
      <Link
        className="brand"
        href="/"
        aria-label="Tech Riders League, inicio"
      >
        <Image
          src="/images/logo.png"
          alt=""
          width={180}
          height={120}
          priority
        />
      </Link>
      <nav className="site-nav" aria-label="Navegación principal">
        {enlaces.map(([label, href], indice) => (
          <Link key={href} href={href}>
            <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24">
              <path fill="currentColor" d={[
                "M2 4l6-2 8 3 6-2v17l-6 2-8-3-6 2zm7 0v13l6 2V6z",
                "M8 3h8v6H8zM2 13h8v8H2zm12 0h8v8h-8zM10 10h4v11h-4z",
                "M8 2h8v3h5v8h-5v3h-2v3h4v3H6v-3h4v-3H8v-3H3V5h5zm-3 5v4h3V7zm11 0v4h3V7z",
                "M4 5h6v6H4zm10 0h6v6h-6zM1 14h10v7H1zm12 0h10v7H13z",
              ][indice]} />
            </svg>
            {label}
          </Link>
        ))}
        {user ? <>
          <Link href={user.staff_status === "approved" ? "/gestion" : "/mi-equipo"}>
            {user.staff_status === "approved" ? "Gestión" : user.staff_status === "pending" || user.is_owner ? "Mi cuenta" : "Mi equipo"}
          </Link>
          <ManagementForm action="logout" label="Cerrar sesión" className="nav-session" />
        </> : <AccessDialog label="Iniciar sesión" title="Accede a la League" navigation>
          <AccessContent />
        </AccessDialog>}
      </nav>
    </header>
  );
}
