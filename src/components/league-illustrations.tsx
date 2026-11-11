export function IconoPerfil({ tipo }: { tipo: "brote" | "herramientas" | "brujula" | "libro" }) {
  const dibujos = {
    brote: (
      <>
        <path fill="#183c58" d="M28 27h8v23h-8zM10 49h44v8H10z" />
        <path fill="#28a978" d="M8 10h12v4h8v8h4v10H20v-4h-8v-8H8zM36 8h20v12h-4v8h-8v4H32V20h4z" />
        <path fill="#85df9c" d="M12 14h8v4h4v4h-8v-4h-4zM40 12h12v4h-8v4h-4z" />
        <path fill="#bb8549" d="M14 49h36v4H14z" />
      </>
    ),
    herramientas: (
      <>
        <path fill="#183c58" d="M8 5h16v6h6v15h-7v7h-7v-7H8zM23 27h9v8h8v8h8v8h7v8H43v-7h-7v-8h-8v-8h-5z" />
        <path fill="#78c9e8" d="M12 9h8v8h6v5H12z" />
        <path fill="#183c58" d="M39 7h17v9h-8v7h-7v8h-8v8h-8v8h-8v10H6V44h8v-8h8v-8h8v-8h9z" />
        <path fill="#ffc44c" d="M42 11h10v2H44v9h-8v8h-8v8h-8v8h-8v7H10v-7h8v-8h8v-8h8v-8h8z" />
      </>
    ),
    brujula: (
      <>
        <path fill="#183c58" d="M20 5h24v5h10v10h5v24h-5v10H44v5H20v-5H10V44H5V20h5V10h10z" />
        <path fill="#ffc44c" d="M21 10h22v5h7v7h4v20h-4v7h-7v5H21v-5h-7v-7h-4V22h4v-7h7z" />
        <path fill="#e6f4fb" d="M22 16h20v4h5v24h-5v4H22v-4h-5V20h5z" />
        <path fill="#e45155" d="M39 20v17H23z" />
        <path fill="#087ba8" d="M23 44V27h16z" />
        <path fill="#183c58" d="M29 29h6v6h-6zM29 11h6v5h-6zM29 48h6v5h-6z" />
      </>
    ),
    libro: (
      <>
        <path fill="#183c58" d="M4 13h20v4h16v-4h20v38H40v4H24v-4H4z" />
        <path fill="#4a8fdb" d="M8 17h16v4h6v28h-6v-3H8zM34 21h6v-4h16v29H40v3h-6z" />
        <path fill="#e6f4fb" d="M11 20h12v4h4v20h-4v-3H11zM37 24h4v-4h12v21H41v3h-4z" />
        <path fill="#87b8d5" d="M13 26h10v3H13zM13 33h10v3H13zM41 26h10v3H41zM41 33h10v3H41z" />
        <path fill="#ffc44c" d="M29 4h6v8h-6zM18 5h4v6h-4zM42 5h4v6h-4z" />
      </>
    ),
  };
  return <svg aria-hidden="true" viewBox="0 0 64 64" shapeRendering="crispEdges">{dibujos[tipo]}</svg>;
}

type CharacterProps = {
  x: number;
  y: number;
  color: string;
  hair: string;
  scale?: number;
};

const avatarColors = [
  { hair: "#253b58", shirt: "#168bd0", skin: "#f1bd8d", accent: "#e8d596" },
  { hair: "#603c46", shirt: "#db76a5", skin: "#f1bd94", accent: "#f3cae0" },
  { hair: "#1d332f", shirt: "#588467", skin: "#e9ad7d", accent: "#a8d7af" },
  { hair: "#806036", shirt: "#e1a643", skin: "#efb98b", accent: "#f2dbab" },
] as const;

export function PixelAvatar({ variant }: { variant: number }) {
  const colors = avatarColors[variant % avatarColors.length];
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64">
      <path fill={colors.shirt} d="M5 64V51q0-12 13-12h28q13 0 13 12v13z" />
      <path fill="#f2f6f7" d="M24 42h16l-3 10h-10z" />
      <path fill={colors.skin} d="M13 18h38v25H13z" />
      <path fill={colors.hair} d="M9 22V12h7V6h10V3h16v5h9v8h6v15h-7V19H17v16H9z" />
      <path fill="#f6d29e" d="M13 19h4v5h-4zm34-1h4v5h-4z" />
      <path fill="#18334e" d="M23 27h5v5h-5zm14 0h5v5h-5z" />
      <path fill="#b8665a" d="M28 37h9v3h-9z" />
      {variant % 2 === 1 ? (
        <path
          fill="none"
          stroke={colors.accent}
          strokeWidth="2"
          d="M19 26h12v8H19zm14 0h12v8H33zm-2 3h2"
        />
      ) : (
        <path fill={colors.accent} d="M9 12h7v5H9zm38-4h7v6h-7z" />
      )}
    </svg>
  );
}

function Character({ x, y, color, hair, scale = 1 }: CharacterProps) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M-21 58v-22q0-20 21-20t21 20v22z" fill={color} />
      <path d="M-12 57V39h24v18" fill="#eaf7ff" />
      <circle cx="0" cy="0" r="20" fill="#f3bd8e" />
      <path d="M-20 0q1-23 21-23t20 20q-8-7-15-9-9 10-26 12" fill={hair} />
      <circle cx="-7" cy="2" r="2" fill="#142a42" />
      <circle cx="7" cy="2" r="2" fill="#142a42" />
      <path d="M-5 10q5 5 10 0" fill="none" stroke="#9e4e46" strokeWidth="2" />
      <path d="M-16 37h32v7h-32z" fill="#142a42" opacity=".8" />
    </g>
  );
}

export function HeroIllustration() {
  return (
    <svg
      aria-hidden="true"
      className="hero-illustration"
      viewBox="0 0 1200 430"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="hero-sky" x2="0" y2="1">
          <stop stopColor="#154171" />
          <stop offset=".58" stopColor="#43a8dc" />
          <stop offset="1" stopColor="#92dcdf" />
        </linearGradient>
        <linearGradient id="hero-ground" x2="0" y2="1">
          <stop stopColor="#478e5b" />
          <stop offset="1" stopColor="#173e4c" />
        </linearGradient>
        <pattern id="hero-pixels" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M0 0h3v3H0zm16 8h2v2h-2zm8 16h4v3h-4z" fill="#fff" opacity=".16" />
        </pattern>
      </defs>
      <path fill="url(#hero-sky)" d="M0 0h1200v430H0z" />
      <path
        fill="#ffd778"
        opacity=".28"
        d="m623 212-270-212h62l230 206L461 0h42l163 194L540 0h34l92 185L623 0h24l21 183L689 0h22l-27 188L797 0h31L695 195 877 0h40L705 205 1005 0h55L710 220z"
      />
      <path fill="url(#hero-pixels)" d="M0 0h1200v430H0z" />
      <path fill="#30739a" d="m0 279 119-121 93 66 137-137 117 139 125-108 107 109 128-142 123 126 116-89 135 117v191H0z" />
      <path fill="#246084" d="m0 330 132-116 115 56 108-102 117 125 120-116 101 100 130-123 106 108 91-83 180 104v147H0z" />
      <g fill="#eaf5e3">
        <path d="m302 146 47-59 41 61-28-14-18 17-17-12z" />
        <path d="m654 164 40-57 43 57-28-14-17 16-18-12z" />
        <path d="m934 145 38-54 42 57-25-14-18 16-18-12z" />
        <path d="m1094 230 29-39 33 42-20-10-15 12-14-9z" />
      </g>
      <g fill="#f8fbff" opacity=".9">
        <path d="M112 87h63v13h-63zM127 72h40v15h-40zM96 99h93v10H96z" />
        <path d="M791 91h70v13h-70zM810 77h40v14h-40zM775 104h97v10h-97z" />
        <path d="M1021 66h67v12h-67zM1042 53h38v13h-38z" />
      </g>
      <g fill="#183c58">
        <path d="M932 197h44v83h-44zM941 170h26v27h-26zM985 217h38v63h-38zM992 194h24v23h-24z" />
      </g>
      <g fill="#f0b65f">
        <path d="M941 178h9v12h-9zm19 0h9v12h-9zm-19 31h9v12h-9zm19 0h9v12h-9zm36 1h8v11h-8zm16 0h8v11h-8z" />
      </g>
      <g fill="#194e50">
        <path d="M24 226h30v105H24zm39-25h25v130H63zm1010 27h31v107h-31zm42-32h25v132h-25zm45 39h28v96h-28z" />
      </g>
      <path fill="url(#hero-ground)" d="M0 319q146-56 281 0t264 1q145-61 279 0t259-4q70-31 117-6v120H0z" />
      <path fill="#78bb66" d="M0 324q129-39 264 1t281-1q139-44 279 2t263-2q75-25 113-7v30H0z" />
      <g fill="#ffd06a">
        <path d="M72 319h13v9H72zm104-13h12v8h-12zm153 23h12v8h-12zm198-20h12v8h-12zm350 22h12v8h-12zm152-23h12v8h-12zm108 15h12v8h-12z" />
      </g>
      <g transform="translate(595 236)">
        <path fill="#7b4a32" d="M-66 44q-37 33-38 76 17 16 54 7l27-23 33 22q39 10 55-7-4-48-45-77z" />
        <path fill="#b96c40" d="M-59 34q-51-13-48 54 19 29 46 8l22-37zm85 0q51-13 48 54-19 29-46 8L6 59z" />
        <circle cx="-39" cy="24" r="29" fill="#e8a45f" />
        <circle cx="39" cy="24" r="29" fill="#e8a45f" />
        <circle cx="0" cy="51" r="67" fill="#e8a45f" />
        <path fill="#f7cf91" d="M-48 47q13-34 48-31 35-3 48 31-4 40-48 47-44-7-48-47z" />
        <ellipse cx="-23" cy="46" rx="6" ry="9" fill="#26354a" />
        <ellipse cx="23" cy="46" rx="6" ry="9" fill="#26354a" />
        <ellipse cy="67" rx="14" ry="10" fill="#69402f" />
        <path d="M-10 77q10 10 20 0" fill="none" stroke="#69402f" strokeWidth="4" />
        <path fill="#f7f8f2" d="M-47 117q47-22 94 0l38 99H-85z" />
        <path fill="#1684cb" d="M-27 153q28-22 54 0-13 21-27 20-14 1-27-20" />
        <path fill="#f7f8f2" d="m-48 120-42 63 17 15 50-54zm96 0 42 63-17 15-50-54z" />
        <path fill="#edb77b" d="M-90 181q-13-4-20 9 10 22 29 8l8-10zm180 0q13-4 20 9-10 22-29 8l-8-10z" />
      </g>
      <g transform="translate(629 44) rotate(-8)">
        <path d="M0 0v103" stroke="#473c33" strokeWidth="7" />
        <path fill="#fff8d8" stroke="#493f35" strokeWidth="4" d="M0 5h142v70H0z" />
        <path fill="#147fd0" d="M93 22q14-18 31 0-8 12-16 12-8 0-15-12" />
        <text x="15" y="34" fill="#122d46" fontFamily="Arial,sans-serif" fontSize="18" fontWeight="900">TECH</text>
        <text x="15" y="56" fill="#122d46" fontFamily="Arial,sans-serif" fontSize="18" fontWeight="900">RIDERS</text>
      </g>
      <Character x={404} y={304} color="#ec70a4" hair="#493654" scale={1.03} />
      <Character x={475} y={278} color="#168bd0" hair="#372f32" scale={1.15} />
      <Character x={723} y={287} color="#203d57" hair="#173c36" scale={1.15} />
      <Character x={801} y={315} color="#df5364" hair="#d36a9e" scale={1.02} />
      <Character x={871} y={328} color="#eaae43" hair="#79563c" scale={0.88} />
      <g fill="#f4ce79">
        <path d="M281 346h22v10h-22zm687 7h20v9h-20zM354 364h15v8h-15zm561-30h14v8h-14z" />
      </g>
    </svg>
  );
}

export function JourneyIsland({ index }: { index: number }) {
  const accent = ["#f3bf58", "#55c7e9", "#777bf0", "#49b8cd", "#ffc64c"][index - 1];
  return (
    <svg aria-hidden="true" className="journey-island" viewBox="0 0 240 150">
      <path fill="#e9f4ff" d="M10 130q20-25 48-12 13-27 42-12 20-32 48-9 20-24 47-4 20 0 35 37-31 15-56 5-28 19-51 1-30 20-57 2-33 14-56-8z" />
      <path fill="#40845c" d="m29 80 36-32 36 15 28-37 39 35 38-17 22 30-28 33-49 14-37-10-46 13-50-16z" />
      <path fill="#77563e" d="m29 80 36-17 36 14 28-21 39 18 38-11 22 17-28 33-49 14-37-10-46 13-50-16z" />
      <path fill="#b68b55" d="m50 98 18 7-10 8-20-7zm58 10 22-9 14 8-24 9zm68-6 20-8 15 10-23 8z" />
      <path fill={accent} d="M81 63h34V38H81zm39 2h30V26h-30zm36 10h28V49h-28z" />
      <path fill="#f3f5e8" d="M87 44h7v7h-7zm14 0h7v7h-7zm-14 12h7v7h-7zm14 0h7v7h-7zm26-22h7v8h-7zm13 0h7v8h-7zm-13 14h7v8h-7zm13 0h7v8h-7zm15 10h6v7h-6zm12 0h6v7h-6z" />
      <path fill="#295a43" d="M42 67h15v24H42zm-4-10h23v12H38zm155 8h14v26h-14zm-5-9h24v12h-24z" />
      <path fill="#ffd766" d="M64 46h6v6h-6zm104-21h7v7h-7zm41 48h7v7h-7zm-144 2h7v7h-7z" />
      <path d="M22 124q96 22 198-1" fill="none" stroke="#ffd875" strokeWidth="3" strokeDasharray="4 7" />
    </svg>
  );
}

export function NextStopIllustration() {
  return (
    <svg aria-hidden="true" className="next-stop-illustration" viewBox="0 0 300 210">
      <path fill="#173f69" d="M0 0h300v210H0z" />
      <circle cx="226" cy="43" r="23" fill="#ffd96d" opacity=".9" />
      <path fill="#246488" d="m0 147 59-58 52 38 55-70 46 75 40-37 48 48v67H0z" />
      <path fill="#76bd80" d="M20 130q44-35 91 0 44-39 91-1 35-24 77 5l-20 35-43 8-42-9-48 9-54-12-47 10-37-14z" />
      <path fill="#825d43" d="m36 139 45 13-12 34-40-8zm92 8 43-12 17 48-48 11zm76-5 37 2 17 38-41 8z" />
      <path fill="#f6c55e" d="M112 107h39V80h-39zm42-4h39V65h-39z" />
      <path fill="#e7f8fc" d="M119 88h8v8h-8zm15 0h8v8h-8zm28-14h8v8h-8zm16 0h8v8h-8z" />
      <path fill="#fff" d="M42 54h57v10H42zm13-12h38v12H55zm-27 22h78v9H28z" opacity=".85" />
      <path fill="none" stroke="#8bdff1" strokeWidth="4" strokeDasharray="6 8" d="M46 111q42-42 86 0t91-2" />
    </svg>
  );
}

export function CommunityMark({ index }: { index: number }) {
  const color = index < 3 ? "#087eae" : "#6e91ad";
  return (
    <svg aria-hidden="true" viewBox="0 0 64 48">
      {index === 0 ? (
        <path fill={color} d="M18 37h32a10 10 0 0 0 0-20 17 17 0 0 0-32-3 12 12 0 0 0 0 23zm8-1 6-7 6 7h-4v7h-4v-7z" />
      ) : index === 1 ? (
        <g fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round">
          <path d="M18 7h28v34H18zM25 14h14M25 22h14M25 30h8" />
        </g>
      ) : index === 2 ? (
        <g fill={color}>
          <circle cx="32" cy="13" r="10" />
          <circle cx="13" cy="20" r="7" />
          <circle cx="51" cy="20" r="7" />
          <path d="M14 43v-7a18 18 0 0 1 36 0v7zm-13 0v-6a12 12 0 0 1 12-12q3 0 5 1-7 8-7 17zm62 0H53q0-10-7-17 3-1 5-1a12 12 0 0 1 12 12z" />
        </g>
      ) : (
        <g fill={color}>
          <circle cx="20" cy="16" r="8" />
          <circle cx="44" cy="16" r="8" />
          <circle cx="32" cy="11" r="9" />
          <path d="M5 42v-9a15 15 0 0 1 30 0v9zm24 0v-9q0-6-3-11 3-2 6-2a15 15 0 0 1 15 15v7z" />
        </g>
      )}
    </svg>
  );
}
