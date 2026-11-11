# Migración de cuentas de operadores

La herramienta solo prepara cuentas y perfiles. No ejecutar hasta comprobar que las reglas y el cliente desplegados admiten estos perfiles y que el proyecto y la base de datos son los correctos.

El catálogo se lee de `apptolva_bitacora/js/catalogoOperadores.js`. El perfil usa `usuarios/{correo-en-minúsculas}` para conservar la estructura existente. La cuenta 221417 es operador y 221948 es master con `rol_evaluaciones: evaluador`.

## Antes de aplicar

1. Verificar el proyecto de staging, la base `(default)`, los permisos de la identidad de Application Default Credentials y que el proveedor correo/contraseña esté habilitado.
2. Ejecutar `node migrar_operadores.js --project ID_DE_STAGING` para validar el catálogo. Esta simulación no consulta Firebase y no detecta conflictos existentes.
3. Preparar una carpeta privada fuera del repositorio. La herramienta guarda ahí contraseñas temporales cifradas con AES-256-GCM; conservar el archivo y la frase secreta para poder reanudar. Proteger además la carpeta con los permisos del sistema operativo: en Windows el modo `0600` no garantiza una ACL privada.
4. En una terminal privada definir la variable de proceso `APPTOLVA_MIGRATION_KEY` con una frase secreta fuerte de al menos 16 caracteres. No introducirla en el comando, el repositorio ni los registros de ejecución. Conservarla mediante un canal seguro y quitarla del entorno cuando termine.
5. Solo tras revisar el objetivo, ejecutar `node migrar_operadores.js --project ID_DE_STAGING --apply --confirm ID_DE_STAGING --credentials-file C:\RUTA_PRIVADA\credenciales-cifradas.json`.

El archivo se crea antes de escribir en Firebase. Repetir exactamente con el mismo archivo, frase y proyecto permite reanudar después de una interrupción; no cambiar el archivo ni regenerarlo si ya hubo escrituras. La herramienta no modifica contraseñas ni perfiles preexistentes y devuelve código distinto de cero ante conflictos o fallos. Revisar individualmente todos los conflictos; no entregar las contraseñas asociadas a cuentas preexistentes.

Para consultar una contraseña de una cuenta creada por esta migración, desde una terminal privada y con la misma variable de entorno, ejecutar `node migrar_operadores.js --project ID_DE_STAGING --credentials-file C:\RUTA_PRIVADA\credenciales-cifradas.json --show-credential NUMERO_EMPLEADO`. El comando muestra la contraseña en pantalla: no grabar ni compartir la salida, y entregarla manualmente por un canal seguro. Verifica que Auth y el perfil coincidan con el UID de la migración, pero no puede verificar si la contraseña se cambió posteriormente.

No ejecutar con producción hasta verificar staging y obtener una aprobación independiente. Mantener el archivo cifrado solo el tiempo necesario para distribución y recuperación, y después eliminarlo conforme a la política de manejo de credenciales.

## Bloqueos y límites de la transición

- Staging es `apptolva-staging` y su base `(default)` es Standard. El comando sin `--apply` solo simula; no se han aplicado la migración ni las reglas en Firebase.
- El checklist conserva una copia completa en el dispositivo antes de encolar el envío y la elimina solo cuando Firestore confirma la escritura. En el menú, «Reportes pendientes de confirmar» permite reintentar sin cambiar el identificador ni la fecha original. Si el almacenamiento está lleno, el envío se detiene y se conserva el formulario. La copia no sustituye al PDF ni sobrevive a borrar los datos del navegador, desinstalar o perder el dispositivo.
- Los cierres NOM-087 usan su propia cola local; ante un rechazo se conserva el cierre y se muestra la opción de reintentar. Un rechazo de validación puede repetirse hasta que se corrija su causa; contactar al administrador.
- La sesión y los datos locales quedan vinculados a un proyecto y una cuenta. Si hay datos anteriores sin propietario confirmado, conservarlos, recuperar la sesión anterior y sincronizarlos antes de cambiar de cuenta; no borrar almacenamiento ni reasignarlos automáticamente. Para otra cuenta, usar un perfil de navegador separado.
- Las reglas conservan acceso anónimo para compatibilidad con versiones anteriores y no garantizan aislamiento completo de datos históricos. Son un prototipo que requiere revisión y pruebas adicionales antes de desplegarse.
- El perfil guardado solo controla la presentación sin conexión: las reglas del servidor siguen autorizando las operaciones y los cambios de rol no se pueden verificar hasta recuperar conectividad. El inicio de sesión inicial, los folios definitivos y las funciones remotas requieren conexión.
