# Migración de cuentas de operadores

La herramienta solo prepara cuentas y perfiles. No ejecutar hasta comprobar que las reglas y el cliente desplegados admiten estos perfiles y que el proyecto y la base de datos son los correctos.

El catálogo se lee de `apptolva_bitacora/js/catalogoOperadores.js`. El perfil usa `usuarios/{correo-en-minúsculas}` para conservar la estructura existente. La cuenta 221417 es operador y 221948 es master con `rol_evaluaciones: evaluador`.

## Gestión desde el panel

La gestión de altas y contraseñas está limitada en código a `apptolva-staging` y `gen-lang-client-0015118308`. La tarjeta aparece únicamente a un administrador autorizado para operaciones sensibles en Netlify. Las funciones vuelven a comprobar la identidad y el rol en el servidor; para gestionar cuentas también se requiere una lista de correos autorizados configurada en Firebase.

Antes de desplegar, configurar la variable `DEPURACION_MASIVA_EMAILS` con la lista autorizada separada por comas, en los archivos locales ignorados `functions/.env.apptolva-staging` y `functions/.env.gen-lang-client-0015118308` según el entorno. Debe mantenerse coherente con la variable de Netlify: son entornos distintos y no se sincronizan automáticamente. Una lista vacía niega la gestión. No guardar contraseñas en esos archivos ni en el repositorio.

Las funciones pueden desplegarse selectivamente con `firebase deploy --only functions:gestionarOperador,functions:catalogoOperadores --project apptolva-staging`; después de validar staging, usar el mismo comando con `--project gen-lang-client-0015118308` para producción. El panel y sus recursos requieren además el despliegue de Netlify correspondiente; publicar las funciones por sí solo no actualiza la interfaz. Verificar primero las pruebas de Auth y Firestore Emulator: `firebase emulators:exec --project demo-apptolva --only auth,firestore "node --test functions/operadores.test.js"`.

El alta crea una identidad de Firebase Authentication con el formato `numero@apptolva.com`: **no crea un buzón de correo electrónico**. La contraseña debe tener entre 8 y 128 caracteres y entregarse por un canal seguro; nunca se guarda en Firestore. El perfil y la entrada del catálogo se crean juntos; si Auth se creó pero Firestore falló, esperar cinco minutos y repetir el alta con el mismo número y nombre. Un perfil existente o una cuenta ajena se rechazan y requieren revisión manual.

Las entradas nuevas se sincronizan con el catálogo incluido en el cliente mediante una función autenticada. La última copia disponible se guarda por proyecto y usuario para su uso offline; el dispositivo debe haberla recibido al menos una vez con conexión. Las sesiones anónimas antiguas conservan solo el catálogo incluido. El restablecimiento conserva el UID y no reactiva cuentas deshabilitadas ni modifica perfiles con roles especiales. Revoca los refresh tokens, pero los ID tokens existentes pueden seguir siendo válidos hasta que expiren si el servicio no comprueba su revocación.

## Antes de aplicar

1. Verificar el proyecto de staging, la base `(default)`, los permisos de la identidad de Application Default Credentials y que el proveedor correo/contraseña esté habilitado.
2. Ejecutar `node migrar_operadores.js --project ID_DE_STAGING` para validar el catálogo. Esta simulación no consulta Firebase y no detecta conflictos existentes.
3. Preparar una carpeta privada fuera del repositorio. La herramienta guarda ahí las contraseñas cifradas con AES-256-GCM; conservar el archivo y la frase secreta para poder reanudar. Proteger además la carpeta con los permisos del sistema operativo: en Windows el modo `0600` no garantiza una ACL privada.
4. En una terminal privada definir la variable de proceso `APPTOLVA_MIGRATION_KEY` con una frase secreta fuerte de al menos 16 caracteres. No introducirla en el comando, el repositorio ni los registros de ejecución. Conservarla mediante un canal seguro y quitarla del entorno cuando termine.
5. Solo tras revisar el objetivo, ejecutar `node migrar_operadores.js --project ID_DE_STAGING --apply --confirm ID_DE_STAGING --credentials-file C:\RUTA_PRIVADA\credenciales-cifradas.json`.

El archivo se crea antes de escribir en Firebase. Repetir exactamente con el mismo archivo, frase y proyecto permite reanudar después de una interrupción; no cambiar el archivo ni regenerarlo si ya hubo escrituras. La herramienta no modifica contraseñas ni perfiles preexistentes y devuelve código distinto de cero ante conflictos o fallos. Revisar individualmente todos los conflictos; no entregar las contraseñas asociadas a cuentas preexistentes.

Para archivos nuevos, las cuentas de operador reciben ocho palabras independientes elegidas criptográficamente de un diccionario de 20 palabras y cuatro dígitos aleatorios. Las cuentas master conservan contraseñas aleatorias fuertes. La frase de operador tiene aproximadamente 48 bits de entropía, menos que la contraseña anterior; no garantiza protección frente a fuerza bruta y requiere controles de intentos y supervisión apropiados. Confirmar que la política de contraseñas configurada en Firebase acepte el formato antes de aplicar. Abrir un archivo existente conserva exactamente sus credenciales anteriores; este cambio no modifica contraseñas ya creadas en Firebase.

Para consultar una contraseña de una cuenta creada por esta migración, desde una terminal privada y con la misma variable de entorno, ejecutar `node migrar_operadores.js --project ID_DE_STAGING --credentials-file C:\RUTA_PRIVADA\credenciales-cifradas.json --show-credential NUMERO_EMPLEADO`. El comando muestra la contraseña en pantalla: no grabar ni compartir la salida, y entregarla manualmente por un canal seguro. Verifica que Auth y el perfil coincidan con el UID de la migración, pero no puede verificar si la contraseña se cambió posteriormente.

Para distribuir la lista completa de operadores, en una terminal privada ejecutar `node migrar_operadores.js --project ID_DE_STAGING --confirm ID_DE_STAGING --credentials-file C:\RUTA_PRIVADA\credenciales-cifradas.json --show-credentials`. Antes de mostrar cualquier contraseña se comprueban todas las cuentas y perfiles de operador; si falta alguno, está deshabilitado o no coincide, no se muestra la lista. Las cuentas master se excluyen y se consultan solo individualmente. La salida contiene contraseñas en texto claro: no enviarla a registros compartidos ni guardarla en el repositorio; proteger cualquier impresión o copia y destruirla tras la entrega. Si se cambió una contraseña en Firebase, el archivo cifrado conserva la anterior y no puede comprobar cuál está vigente; solicitar un restablecimiento en lugar de suponer que la guardada sigue funcionando.

No ejecutar con producción hasta verificar staging y obtener una aprobación independiente. Mantener el archivo cifrado solo el tiempo necesario para distribución y recuperación, y después eliminarlo conforme a la política de manejo de credenciales.

## Bloqueos y límites de la transición

- Staging es `apptolva-staging` y su base `(default)` es Standard. El comando sin `--apply` solo simula; no se han aplicado la migración ni las reglas en Firebase.
- El checklist conserva una copia completa en el dispositivo antes de encolar el envío y la elimina solo cuando Firestore confirma la escritura. En el menú, «Reportes pendientes de confirmar» permite reintentar sin cambiar el identificador ni la fecha original. Si el almacenamiento está lleno, el envío se detiene y se conserva el formulario. La copia no sustituye al PDF ni sobrevive a borrar los datos del navegador, desinstalar o perder el dispositivo.
- Los cierres NOM-087 usan su propia cola local; ante un rechazo se conserva el cierre y se muestra la opción de reintentar. Un rechazo de validación puede repetirse hasta que se corrija su causa; contactar al administrador.
- La sesión y los datos locales quedan vinculados a un proyecto y una cuenta. Si hay datos anteriores sin propietario confirmado, conservarlos, recuperar la sesión anterior y sincronizarlos antes de cambiar de cuenta; no borrar almacenamiento ni reasignarlos automáticamente. Para otra cuenta, usar un perfil de navegador separado.
- Las reglas conservan acceso anónimo para compatibilidad con versiones anteriores y no garantizan aislamiento completo de datos históricos. Son un prototipo que requiere revisión y pruebas adicionales antes de desplegarse.
- El perfil guardado solo controla la presentación sin conexión: las reglas del servidor siguen autorizando las operaciones y los cambios de rol no se pueden verificar hasta recuperar conectividad. El inicio de sesión inicial, los folios definitivos y las funciones remotas requieren conexión.
