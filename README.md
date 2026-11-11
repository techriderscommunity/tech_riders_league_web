# Tech Riders League

Web de la temporada Tech Riders League: mapa de mundos, participación por
equipos, clasificación, premios y gestión privada del evento.

**Entorno de pruebas:** https://app-league-test-f22a.azurewebsites.net

## Stack y requisitos

- Node.js 24 y npm.
- Next.js 16, React 19 y TypeScript.
- PostgreSQL 18: sesiones, equipos, inscripciones, resultados y auditoría.
- SMTP autorizado para activaciones, recuperación de acceso e invitaciones.

El repositorio contiene exclusivamente la aplicación web y sus recursos,
migraciones, pruebas y automatización. No necesita herramientas de generación
de proyectos ni dependencias locales externas al repositorio.

## Desarrollo local

```powershell
npm ci
Copy-Item .env.example .env.local
```

Configura `DATABASE_URL` con una base PostgreSQL local y `APP_URL` con
`http://localhost:3000`. Las credenciales de ejemplo no son de producción.

```powershell
npm run db:migrate
npm run dev
```

Abre http://localhost:3000. No se usa SQLite ni una base simulada.
El registro está cerrado por defecto: no activar `REGISTRATION_ENABLED` hasta
probar el correo, revisar los textos legales y preparar la operación real.

## Comprobaciones

```powershell
npm run typecheck
npm run build
npm test
```

Las pruebas levantan un PostgreSQL aislado con datos ficticios y lo eliminan
al finalizar. No requieren credenciales reales ni envían correos a personas.
Para incluir los contratos HTTP de la compilación de producción:

```powershell
$env:LEAGUE_PRODUCTION_TEST = "true"
npm test
```

## GitHub → Azure

El workflow [azure.yml](.github/workflows/azure.yml):

1. En pull requests a `main`: instala con lockfile, comprueba tipos, compila
   y ejecuta las pruebas, incluidas las rutas HTTP de producción.
2. En pushes a `main` o ejecución manual desde `main`: prepara un ZIP Linux
   solo con dependencias de producción y la compilación ya validada.
3. Autentica en Azure mediante OIDC, sin secretos de cliente ni publish profiles.
4. Despliega sobre el App Service existente, aplica las migraciones al arrancar
   y comprueba páginas públicas y protección de la exportación privada.

El entorno GitHub `azure-test` permite despliegues solo desde `main`.
Sus variables son:

| Variable | Contenido |
|---|---|
| `AZURE_CLIENT_ID` | Client ID de la identidad de despliegue, no la identidad de runtime |
| `AZURE_TENANT_ID` | Tenant de Azure |
| `AZURE_SUBSCRIPTION_ID` | Suscripción del entorno |
| `AZURE_RESOURCE_GROUP` | Grupo del App Service existente |
| `AZURE_WEBAPP_NAME` | Nombre de la aplicación |
| `AZURE_WEBAPP_URL` | URL HTTPS, sin barra final |

La credencial federada confía exclusivamente en
`repo:techriderscommunity/tech_riders_league:environment:azure-test`.
La identidad de despliegue tiene `Website Contributor` únicamente sobre esta
web; no está adjunta al runtime ni tiene acceso PostgreSQL. Las credenciales
SMTP/GitHub y la configuración de datos permanecen en App Service, nunca en
el repositorio ni en el artefacto.

La base PostgreSQL es privada. Las migraciones se ejecutan desde App Service
dentro de su VNet, no desde el runner público de GitHub. El CI no recrea la
infraestructura, cambia el tamaño de los servicios ni abre el registro.

El B1 no tiene slots: hay una breve ventana de mantenimiento con HTTP 503.
Se restaura el comando de inicio incluso si falla el despliegue, pero eso no
revierte archivos ni migraciones ya aplicadas. Un fallo requiere revisar los
logs y, si procede, volver a desplegar una versión compatible. Para migraciones
destructivas, preparar primero copia/restauración y un procedimiento específico.

El primer despliegue presupone que ya existe la web configurada con red privada,
identidad de runtime y base migrada. La configuración inicial se documenta en
[Azure](docs/AZURE-PRUEBAS.md); las plantillas están en [infra](infra).
No ejecutar `bootstrapEnabled=true` en despliegues ordinarios.

## Operación

- [Gestión, correo y cuenta responsable](docs/GESTION-SETUP.md).
- [Entregas privadas de GitHub](docs/GITHUB-ENTREGAS.md).
- [Infraestructura de pruebas y límites](docs/AZURE-PRUEBAS.md).

El mapa resalta los destinos al pasar el ratón o enfocarlos, pero sus fichas
solo se abren al pulsar. La inscripción se presenta como tres misiones RPG:
conseguir los pases Luma, formar el equipo y obtener la validación manual.
La ambientación no cambia las reglas ni concede puntos ficticios.

Los textos publicados proceden de `content/temporada.json`. La información
pendiente no se presenta como confirmada. Los recursos gráficos y marcas se
incluyen para esta web; no se concede una licencia adicional sobre ellos.
