"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./intranet-shell.module.css";

type Metric = { label: string; value: string };
type MemberIcon = "profile" | "team" | "missions" | "rankings" | "resources";
type Item = { key: string; label: string; href: string; icon?: MemberIcon };
type ItemGroup = { label?: string; items: Item[] };

const memberItems: Item[] = [
  { key: "profile", label: "Mi perfil", href: "/mi-equipo/perfil", icon: "profile" },
  { key: "team", label: "Mi equipo", href: "/mi-equipo/equipo", icon: "team" },
  { key: "missions", label: "Mis misiones", href: "/mi-equipo/misiones", icon: "missions" },
  { key: "rankings", label: "Rankings", href: "/mi-equipo/rankings", icon: "rankings" },
  { key: "resources", label: "Recursos", href: "/mi-equipo/recursos", icon: "resources" },
];

const memberIconPaths: Record<MemberIcon, string> = {
  profile: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm-9 10a9 9 0 0 1 18 0H3z",
  team: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM1 21a8 8 0 0 1 16 0H1zm15-6a6 6 0 0 1 7 6h-4a9 9 0 0 0-3-6z",
  missions: "M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1v5h5M8 12h8v2H8zm0 4h8v2H8z",
  rankings: "M3 13h4v8H3zm7-6h4v14h-4zm7-5h4v19h-4z",
  resources: "M4 3h7a3 3 0 0 1 3 3v15a3 3 0 0 0-3-3H4zm16 0h-4a3 3 0 0 0-3 3v15a3 3 0 0 1 3-3h4z",
};

const profileItem: Item = { key: "account", label: "Mi perfil", href: "/mi-equipo/perfil" };
const communityItem: Item = { key: "community", label: "Comunidad", href: "/gestion/comunidad" };
const staffDirectoryItem: Item = { key: "staff-directory", label: "Staff", href: "/gestion/staff" };
const staffRequestItem: Item = { key: "staff", label: "Solicitudes Staff", href: "/gestion/solicitudes-staff" };
const teamItem: Item = { key: "teams", label: "Equipos", href: "/gestion/equipos" };
const deliveryItem: Item = { key: "deliveries", label: "Entregas", href: "/gestion/entregas" };
const evaluationItem: Item = { key: "evaluations", label: "Evaluaciones", href: "/gestion/evaluaciones" };
const dashboardItems: Item[] = [
  { key: "worlds", label: "Mi mundo (Datos)", href: "/gestion/mundos" },
  { key: "challenges", label: "Retos en GitHub", href: "/gestion/retos" },
  { key: "participants", label: "Participantes", href: "/gestion/participantes" },
  { key: "points", label: "Puntos", href: "/gestion/puntos" },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase("es") ?? "").join("");
}

function staffGroups(admin: boolean): ItemGroup[] {
  const dashboard = dashboardItems.flatMap(item => [
    item.key === "worlds" && admin ? { ...item, label: "Todos los mundos" } : item,
    ...(!admin && item.key === "worlds" ? [teamItem] : []),
  ]);
  return [
    { label: "CUENTA", items: [profileItem] },
    ...(admin ? [{ label: "COMUNIDAD", items: [communityItem, staffDirectoryItem] }] : []),
    {
      label: "PENDIENTES",
      items: [
        ...(admin ? [staffRequestItem, teamItem] : []),
        deliveryItem,
        evaluationItem,
      ],
    },
    { label: "DASHBOARD", items: dashboard },
  ];
}

export function IntranetShell({
  children,
  active,
  title,
  description,
  userName,
  role,
  metrics,
  headingAction,
  headingEyebrow,
  hideTopbar = false,
  staff = false,
  admin = false,
}: {
  children: ReactNode;
  active: string;
  title: string;
  description: string;
  userName: string;
  role: string;
  metrics: Metric[];
  headingAction?: ReactNode;
  headingEyebrow?: string;
  hideTopbar?: boolean;
  staff?: boolean;
  admin?: boolean;
}) {
  const groups = staff ? staffGroups(admin) : [{ items: memberItems }];
  const eyebrow = headingEyebrow ?? (admin ? "Tech Riders League · Admin League" : staff ? "Tech Riders League · Staff" : "Tech Riders League · Participante");

  return <section className={styles.shell} data-intranet-shell="true" aria-label="Intranet Tech Riders League">
    <aside className={styles.sidebar}>
      <nav className={styles.sideNav} aria-label="Submenú de intranet">
        {groups.map((group, index) => <div className={styles.navGroup} key={group.label ?? `group-${index}`} role="group" aria-label={group.label}>
          {group.label ? <span className={styles.navGroupLabel}>{group.label}</span> : null}
          {group.items.map(item => <Link key={item.key} href={item.href} aria-current={active === item.key ? "page" : undefined}>
            {item.icon
              ? <svg className={styles.navIcon} viewBox="0 0 24 24" aria-hidden="true"><path d={memberIconPaths[item.icon]} /></svg>
              : <span className={styles.navMark} aria-hidden="true" />}
            <span>{item.label}</span>
          </Link>)}
        </div>)}
      </nav>
    </aside>
    <div className={styles.workspace}>
      {hideTopbar ? null : <div className={styles.topbar}>
        <Link className={styles.account} href="/mi-equipo/perfil" aria-label={`${userName}, ${role}. Abrir perfil`}>
          <span className={styles.avatar} aria-hidden="true">{initials(userName)}</span>
          <span className={styles.accountText}>{userName}<small>{role}</small></span>
        </Link>
      </div>}
      <header className={styles.heading}>
        <div>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {headingAction ?? <span className={styles.seasonBadge}>TEMPORADA 2027</span>}
      </header>
      {metrics.length ? <section className={styles.metrics} aria-label="Resumen">
        {metrics.map(metric => <article className={styles.metric} key={metric.label}>
          <strong>{metric.value}</strong>
          <span>{metric.label}</span>
        </article>)}
      </section> : null}
      <div className={styles.content}>{children}</div>
    </div>
  </section>;
}
