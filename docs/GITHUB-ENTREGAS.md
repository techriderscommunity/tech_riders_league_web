# Entregas privadas GitHub y Hall of Fame

## Modelo

- La web de League es el punto de entrada. Solo el capitan activo vincula GitHub.
- El capitan crea un repositorio privado propio, no un fork, y autoriza la App
  de lectura solo en ese repositorio. No se crean repositorios desde League.
- Vincular cuenta y conectar repositorio son acciones separadas. La asociacion
  guarda usuario GitHub, capitan, equipo, ID estable de repositorio e instalacion.
- Entregar mision valida en servidor equipo, capitan, cuenta, instalacion,
  privacidad, rama, SHA completo y plazo. Vuelve a validar al terminar la captura.
- Una mision publicada necesita deadline con zona horaria. Sin plazo puede existir
  en borrador, pero no acepta entregas. El plazo lo decide cada comunidad.
- El SHA debe pertenecer al historial de la rama indicada. La entrega almacena
  repositorio, mundo, autor, rama, SHA y timestamp de PostgreSQL. Un trigger impide
  editar esa identidad. Reentregar crea otra fila y conserva la version anterior;
  solo se permite antes del plazo y si el reto permite sustituciones.
- Se conserva un ZIP cifrado y autenticado, con integridad de blobs Git y SHA256,
  ligado al ID de entrega. Permite evaluar aunque se borre el SHA en GitHub.
  Conserva archivos binarios y permisos ejecutables. Nunca se ejecuta codigo.
- Limites explicitos: 300 archivos, 1000 entradas de arbol y 20 MiB de contenido.
  No se truncan contratos ni entregas. Se rechazan LFS, submodulos y enlaces
  simbolicos y componentes de ruta `__proto__`; los equipos deben incluir su
  contenido real. Captura acotada. La privacidad se comprueba tambien al acabar
  de descargar los archivos.

## Configurar antes de usar GitHub real

1. Aplicar `npm run db:migrate`, incluida `003-github`.
2. Registrar una GitHub App de entregas. Permisos de repositorio: **Contents read**
   y **Metadata read** implicito. Sin permisos de cuenta adicionales.
3. Registrar callback `APP_URL/api/github/callback`. Configurar client ID,
   client secret, App ID, slug y ruta privada del PEM en las variables de
   `.env.example`. El flujo utiliza OAuth state de uso unico, ligado a usuario,
   equipo y sesion, con caducidad de diez minutos y PKCE S256.
4. Generar una clave aleatoria de 32 bytes en base64 para `GITHUB_SNAPSHOT_KEY`;
   guardarla y respaldarla como secreto. Perderla impide descifrar entregas.
5. El capitan instala la App con **Only select repositories** y elige su privado.
   League verifica privacidad, propietario, ausencia de fork e instalacion
   de lectura. No se admiten instalaciones para todos los repositorios.
6. Registrar otra App para publicacion: **Contents write**, **Pull requests write**
   y Metadata implicito. Instalarla solo en
   `techriderscommunity/tech_riders_league`. Configurar los cuatro valores
   `GITHUB_PUBLISHER_*`. Es independiente de los privados.
7. Ningun token llega al navegador ni se persiste en la BD. Tokens OAuth se usan
   durante callback; tokens de instalacion son efimeros y se restringen al ID
   exacto del repositorio y permisos necesarios. No se usan PAT.
8. Probar ambas Apps con cuentas y repositorios de prueba autorizados antes
   de habilitar la integracion real. Las pruebas locales no crean Apps reales.

Tras cambiar de capitan, el anterior pierde entregas y vinculacion operativa.
El nuevo debe activar su contrasena, vincular su GitHub y volver a conectar el
mismo repositorio. Como se exige propietario propio, el anterior debe transferir
el privado al nuevo y este instalar la App. Se conserva su ID estable y los
snapshots anteriores; no se heredan silenciosamente credenciales GitHub.

La plataforma comprueba privacidad al conectar y entregar. No puede impedir
que el propietario de GitHub cambie manualmente la visibilidad o comparta su
codigo fuera de League: las bases deben prohibirlo durante competicion/evaluacion.

## Evaluar y publicar

1. Antes del deadline no se permite evaluar misiones GitHub ni publicarlas.
2. Despues del plazo staff revisa el SHA exacto. Puede descargar el ZIP privado
   desde League, sin vincular GitHub. Si clona directamente, necesita sus propias
   credenciales autorizadas en ese repositorio y debe hacer checkout del SHA,
   nunca evaluar la rama actual.
3. Las fotos siguen siendo evidencias HTTPS revisadas; el antiguo endpoint de
   enlaces de reto rechaza nuevas entregas de codigo.
4. Resolver evaluaciones y empates y cerrar evaluacion del mundo. Publicar su
   ranking; la global es otra publicacion y no selecciona soluciones de mundos.
5. Seleccionar una entrega actual, aprobada, en el Top 3 del ranking publicado
   de ese mundo. Seleccionar una carpeta dentro del snapshot del SHA entregado.
6. Revisar el ZIP y el manifiesto (rutas, tamanos y hashes). Se bloquean rutas
   peligrosas y patrones comunes de secretos; no sustituye una revision humana.
   Staff debe confirmar que no hay secretos/datos personales y que existen
   derechos de publicacion de todos los archivos.
7. Confirmar expresamente manifiesto y motivo. Solo entonces se copian archivos
   seleccionados a una rama publica de la App de publicacion y se crea un **PR
   borrador**, nunca un fork, ni se hace publico el repositorio privado.
   Destino: `solutions/<mundo>/<posicion>-team-<id-entrega>/`.
8. La rama y PR contienen codigo publico desde su creacion, incluso como borrador.
   La confirmacion es el punto de divulgacion; no esperar al merge para revisarlo.
   No se copian historial Git, otras carpetas ni identidad del repositorio privado.
9. Organizacion revisa e integra el PR en GitHub. No hay merge automatico.
   Revisar workflows del oficial para que no ejecuten codigo no confiable con
   secretos o permisos elevados. La App no necesita permiso de Workflows.
10. Staff sincroniza el estado del PR desde League. Solo los PR integrados aparecen
    en `/memoria`: las cronicas reveladas y Hall of Fame. El resto sigue privado.

La publicacion tiene estados preparado/en curso/fallido/PR/integrado/cancelado.
Un error de red no equivale a inexistencia del PR: reintentar el **mismo trabajo**
reconcilia su rama determinista y PR antes de escribir. Una preparacion sin envio
se puede cancelar. Un trabajo interrumpido se puede recuperar tras quince minutos.
Un PR ya creado se cierra o corrige en GitHub; no prometer retirada de copias.
Mientras se publica no se permite invalidar resultados de ese mundo.
La copia de archivos tiene un limite de dos minutos por intento; un reintento
reconcilia la misma rama y PR.

La retirada de campaña borra identidades GitHub, asociaciones y snapshots
privados. Conserva solo referencias del Hall of Fame ya integrado, sin manifiestos
personales. No elimina codigo ya publicado en GitHub ni copias de terceros.

## Validacion

- `npm test`: PostgreSQL real aislado, fixtures GitHub sin llamadas externas,
  pruebas de permisos, OAuth/PKCE/sesion/caducidad/reuso, privacidad/propietario,
  SHA inmutable, rama, deadlines (antes y despues de captura), reentregas,
  snapshot cifrado, Top 3, confirmacion y reconciliacion de PR ambiguo.
- `npm run typecheck` y `npm run build`.
- `LEAGUE_PRODUCTION_TEST=true` con la build prueba las rutas privadas, descarga
  ZIP por SHA con autorizacion por equipo, publicacion exclusiva de staff,
  exportacion y resultados publicos sin secretos. Las Apps y permisos reales requieren
  una validacion de integracion autorizada aparte.

Referencias oficiales:
- [Tokens de usuario de una GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Acceso de instalaciones](https://docs.github.com/en/rest/apps/installations)
