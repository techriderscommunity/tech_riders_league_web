# Azure: entorno privado de pruebas

Web publica HTTPS en App Service Linux B1 y PostgreSQL 18 B1ms de 32 GiB
en una subred privada. No se usa el plan existente de otra aplicacion.
Registro y GitHub permanecen desactivados. No es un entorno de produccion.

Base mensual estimada en Europa Norte: web 13,14 USD, PostgreSQL 13,14 USD,
disco 4,05 USD y DNS privado 0,50 USD. Total 30,83 USD mas impuestos,
consultas DNS, trafico y excesos de copias. No se presupone saldo de creditos.

## Entorno desplegado

- URL: https://app-league-test-f22a.azurewebsites.net
- Grupo aislado: `rg-league-test-f22a`, region `northeurope`.
- Web: `app-league-test-f22a`; plan nuevo `asp-league-test-f22a`.
- Datos: `pg-league-test-f22a`, base `league`, acceso publico desactivado.
- Registro, correo real y GitHub sin habilitar. Aun no hay cuenta inicial
  de responsable activada; requiere configurar y probar el correo autorizado.

## Seguridad y autenticacion

- PostgreSQL sin acceso publico, TLS verificado y contrasenas desactivadas.
- Identidad administrada de runtime con rol PostgreSQL no administrador,
  acceso a la base League y creacion de objetos para migraciones.
- Identidad separada de inicializacion, administradora de PostgreSQL, adjunta
  temporalmente a la web para crear el rol. Se debe retirar de la web tras
  verificar la primera migracion; nunca dejar `bootstrapEnabled=true`.
- NSG limita conexiones PostgreSQL a la subred de la web y trafico interno
  del servicio. No hay VPN, NAT Gateway ni Private Endpoint adicional.
- La web sigue siendo publica: la red privada protege la conexion a datos,
  no impide que visitantes accedan a las paginas publicas.

## Despliegue

El flujo habitual es GitHub Actions: compila y prueba en Linux, elimina las
dependencias de desarrollo y usa `scripts/package-release.mjs` para generar
el artefacto. `scripts/deploy-azure.sh` despliega ese ZIP ya compilado, sin
recompilar con Oryx sobre el B1. Ver las variables y OIDC en el README raiz.
La identidad `id-github-league-test-f22a` es independiente del runtime y tiene
`Website Contributor` solo sobre esta web. No se adjunta a la aplicacion ni
recibe permisos en la base de datos.

`infra/main.bicep` crea un grupo aislado y sus recursos. Validar con
`az bicep build` y revisar `what-if` antes de aplicar. El parametro
`deployDatabase=false` permite comprobar primero el plan de hosting sin
contratar PostgreSQL. No escalar ni cambiar regiones automaticamente.

No publicar la carpeta de desarrollo completa ni `.env.local`. El ZIP de
produccion incluye `content/temporada.json`, requerido por las paginas publicas.
Esperar a que PostgreSQL este `Ready` antes de configurar su administrador:
Azure puede devolver temporalmente que el servidor aun no esta accesible
para operaciones Entra; reintentar esa configuracion sin recrear el servidor.

Al iniciar, `scripts/azure-initialize.mjs` prepara el rol solo si se configuro
la identidad temporal. `scripts/migrate.mjs` aplica migraciones idempotentes
y el proceso arranca Next. Las conexiones nuevas obtienen tokens efimeros
del endpoint administrado de App Service; no se guardan ni se exponen tokens.
El entorno local conserva autenticacion por contrasena.
Para identidad administrada se pasan host, usuario, puerto y base por separado:
`pg` sobrescribe el callback de token con una contrasena vacia si recibe una
cadena de conexion sin contrasena. El plazo de conexion es de 60 segundos,
incluyendo hasta 30 segundos para obtener el token durante el arranque en frio,
frente a los 5 segundos del modo local.
La inicializacion asigna alias a las columnas de `pgaadauth_list_principals`
para no depender de diferencias de nombres entre versiones del servicio.

No cambiar la configuracion ni reiniciar la web mientras Kudu esta desplegando:
puede interrumpir el despliegue.
En B1, activar temporalmente `node scripts/azure-maintenance.mjs` y esperar
su respuesta de mantenimiento antes de desplegar sobre una web existente.
Este proceso no depende de paquetes y responde 503 con `Retry-After`, evitando
reinicios por dependencias o manifiestos temporalmente ausentes durante la copia.
Tras terminar OneDeploy, restaurar el comando de inicio y verificar la salud.
El workflow desactiva `SCM_DO_BUILD_DURING_DEPLOYMENT` y `ENABLE_ORYX_BUILD`
porque el ZIP ya contiene la compilacion y dependencias Linux. Las plantillas
conservan el modo Oryx para un alta inicial desde fuentes; no reaplicarlas
durante un despliegue de codigo.
Tras un despliegue completo, reiniciar y comprobar los logs del nuevo arranque,
no solo el estado satisfactorio de OneDeploy.

Antes de considerar completado: comprobar HTTPS, tres migraciones, conexion
privada, ausencia de privilegios admin en runtime, registro/GitHub desactivados,
retirada de identidad temporal y persistencia despues de reiniciar la web.

Verificado el 11 de noviembre de 2026 tras reinicio explicito: tres migraciones
persistentes, TLS 1.3, runtime no administrador y una unica identidad adjunta
(`id-league-test-f22a`), sin variables de inicializacion. Paginas publicas 200,
exportacion y snapshots anonimos 401, registro desactivado 503 sin crear cuentas.
Compilacion Linux y typecheck correctos; pruebas PostgreSQL y autenticacion
dirigidas correctas. Checkov no estaba disponible: no se afirma haber superado
un escaneo automatizado de infraestructura.
