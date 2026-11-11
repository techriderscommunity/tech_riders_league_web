# Gestion: puesta en marcha

## Implementado y disponible tras configurar los servicios

- PostgreSQL en todos los entornos, migracion versionada y transacciones.
- Registro individual, contrasenas scrypt, confirmacion de correo y recuperacion.
- El boton Login del menu abre el acceso en un modal sin cambiar de pagina.
  Comparte los formularios con /acceso, conservado para enlaces de correo e
  invitaciones. Registro y recuperacion se abren en dialogos.
  Recuperacion utiliza un unico campo de correo y envia el enlace de contrasena.
- Sesiones revocables con cookie HttpOnly, Secure en produccion; comprobacion de
  origen y limites persistentes de intentos.
- Equipo con nombre unico y maximo cuatro originales; invitaciones por correo,
  vinculadas al destinatario, caducables, cancelables y de uso unico.
- Un integrante solo puede pertenecer a un equipo por temporada.
- Solo el capitan gestiona el equipo; cada integrante tiene cuenta propia.
- Envio a revision, correccion y reenvio; staff aprueba o rechaza con motivo.
- Solicitud de staff sin permisos hasta aprobacion por staff existente.
- Solo el responsable inicial puede dar de baja a otro staff.
- Correo mediante SMTP autorizado y bandeja persistente, con fallos visibles,
  reintentos manuales y procesamiento seguro entre varias instancias.
- Auditoria de las acciones y acceso privado a las pantallas.
- Rectificacion personal; un cambio de correo requiere contrasena actual,
  confirmacion del nuevo correo y revoca las sesiones previas.
- Sustituciones por mundo mediante invitacion y aceptacion individual; tambien
  declarables por staff en el acceso al evento. Nunca crean un original.
- Checks independientes de Luma, asistencia y presencia al final por persona.
  Tres originales dan asistencia valida; tres mundos previos habilitan la final.
- Cambio de capitan aprobado por staff, baja logica del rol anterior y activacion
  obligatoria mediante correo de contrasena, incluso si ya fue capitan.
- Relevo excepcional por fuerza mayor, con motivo, historial y continuidad real.
- Retos versionados, plazo opcional en borrador y obligatorio al publicar,
  apertura/cierre, misiones GitHub privadas fijadas a SHA y foto mediante enlaces
  HTTPS; revision explicita y conservacion de versiones anteriores.
  Ver [GitHub: entregas y Hall of Fame](GITHUB-ENTREGAS.md) para Apps, permisos,
  snapshots cifrados y publicacion autorizada del Top 3 mediante PR borrador.
- Puntos separados de asistencia/foto/reto/bonus, recalculo sin duplicados.
  Bonus por fecha de servidor de la version finalmente aprobada; reentregar
  cambia la fecha. Empates resueltos manualmente por staff con motivo.
- Vista previa privada y publicacion versionada por mundo/global. La global
  agrega solo mundos publicados. Una correccion retira la publicacion afectada
  y la global hasta revisarlas de nuevo; nunca se muestran borradores.
- Premios por podio publicado; vouchers con presencia al final y cupo 5/5/5/5/10.
  Adjudicacion y entrega privadas; el sorteo se realiza por organizacion.
- Busqueda de equipos aprobados y CSV privado compatible con Excel para todos
  los equipos, plantillas y asistencia; proteccion contra formulas de hoja.
- Vinculaciones de staff a comunidades, baja personal independiente y baja
  oficial. Solo el responsable puede revocar una comunidad, porque implica
  dar de baja a otros staff; otras vinculaciones activas conservan permisos.
- Solicitudes de baja de cuenta, resolucion y anonimizacion; un capitan aprobado
  necesita relevo antes. Dar de baja una cuenta no da de baja su comunidad.
- Seguimiento de aportaciones/destinos y recursos autorizados en /memoria.
- Corte de retencion configurable al inicio de la siguiente temporada, con
  limite 15 de enero de 2028. Retirada de datos personales de participacion,
  alias historicos de equipos y conservacion de cuentas de staff activo.

Hay un entorno de pruebas en Azure, sin registro real habilitado.
Ver [Azure: entorno privado de pruebas](AZURE-PRUEBAS.md). Luma sigue siendo manual;
no hay importador obligatorio ni se usan datos del CSV de ejemplo.

## Configuracion

1. Instalar dependencias: `npm install`.
2. Crear `.env.local` tomando `.env.example` como referencia. No subir secretos.
3. Configurar `DATABASE_URL`, `APP_URL` y TLS verificado para produccion.
4. Ejecutar `npm run db:migrate` antes de arrancar la nueva version.
5. Configurar el correo inicial del responsable en `BOOTSTRAP_EMAIL` y ejecutar
   `npm run staff:bootstrap` una sola vez. No hay contrasena predefinida ni
   opcion publica para reclamar el rol. La activacion se envia por correo.
6. Configurar SMTP autorizado para `MAIL_FROM`. La direccion del buzon por si
   sola no habilita SMTP: consultar la politica de Microsoft 365 o el servicio
   autorizado. Esta implementacion usa SMTP autenticado con usuario/contrasena
   sobre TLS; no habilitar autenticacion insegura del tenant para adaptarlo.
   Si el tenant exige OAuth, conectar ese transporte antes del envio real.
7. Ejecutar `npm run mail:send` para procesar la bandeja; tambien puede hacerse
   desde Gestion. Programar el comando con el mismo entorno en produccion.
8. Mantener `REGISTRATION_ENABLED=false` hasta probar correo, completar texto
   legal/operativo e infraestructura. Activarlo abre el CTA de Participacion.
9. `npm run build` y `npm run start`; local puede usar `npm run dev` con la misma
   base PostgreSQL y los mismos transportes, sin sustitutos SQLite.
10. Programar `npm run data:retire` con el mismo entorno privado. Solo actua al
    llegar el corte; la UI del responsable tambien permite ejecutarlo con
    confirmacion explicita. Probar restauracion y caducidad de backups por separado:
    este comando no borra copias externas ni publicaciones de redes sociales.

En produccion las variables deben ser configuracion del servicio, no archivos
versionados. El entorno de pruebas usa App Service Linux B1 y Azure Database for
PostgreSQL Flexible Server privado en Europa Norte, con identidades administradas.
El registro, correo real y GitHub no estan habilitados. La estimacion aprobada
es de 31-33 USD/mes; no es una validacion de capacidad para produccion.

## Pruebas

- `npm test`: incluye PostgreSQL real aislado con datos ficticios; no necesita
  credenciales de produccion. El cluster se detiene y se elimina al terminar.
- `npm run typecheck` y `npm run build`.
- Para probar tambien los endpoints de la build de produccion en PowerShell:

  ```powershell
  npm run build
  $env:LEAGUE_PRODUCTION_TEST = 'true'
  node --experimental-strip-types --test tests\management-postgres.test.ts
  ```

Los tests no envian mensajes reales. Verifican el contenido de la bandeja de
salida, tokens de un solo uso, duplicados, cuatro integrantes, correcciones,
aprobaciones encadenadas, permisos exclusivos del responsable, recuperacion
de contrasena y revocacion de sesiones. Tambien cubren migracion desde el primer
esquema e idempotencia, sustitutos/plantillas, tres originales en tres mundos,
activacion de capitan, versiones de entrega, puntos/bonus/empates, retirada de
publicaciones tras corregir, cuotas de vouchers, comunidades y retirada de datos.
La prueba opcional de produccion comprueba las pantallas de equipo/staff,
resultados publicos sin correos, exportacion autorizada y confirmacion de retirada.

## Limites operativos

- Procesar la bandeja periodicamente; crear una invitacion no equivale a enviarla.
- Una respuesta SMTP aceptada no garantiza que el correo haya llegado a inbox.
- Los destinatarios pendientes/fallidos solo se muestran a staff autorizado.
- El cuerpo de mensajes enviados se borra de la bandeja; los tokens se almacenan
  como hashes y tienen caducidad. Configurar limpieza de expirados, auditoria y
  copias de seguridad conforme a los plazos antes de produccion.
- No se importa el CSV de invitados, ni se generan cuentas a partir de el.
- La politica publicada refleja las decisiones aportadas, pero no inventa
  proveedores o canales aun sin configurar.
- Antes del entorno real: configurar PostgreSQL/TLS, SMTP autorizado, responsable
  inicial, tareas de correo/retencion, backups y monitorizacion; repetir las
  pruebas con esos servicios. No equivalen a tareas de desarrollo bloqueadas.
