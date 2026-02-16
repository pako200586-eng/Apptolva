# 🚀 Guía de Despliegue en Netlify - AppTolva

Esta guía te llevará paso a paso a través del proceso de despliegue de AppTolva en Netlify.

## 📋 Requisitos Previos

Antes de comenzar, asegúrate de tener:

1. Una cuenta en [Netlify](https://www.netlify.com/) (gratuita)
2. Las claves API necesarias:
   - **GOOGLE_AI_API_KEY** - API Key de Google Generative AI
   - **FIREBASE_API_KEY** - API Key de Firebase

## 🔑 Obtener las API Keys

### Google Generative AI API Key

1. Ve a [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Inicia sesión con tu cuenta de Google
3. Haz clic en "Create API Key"
4. Copia y guarda la clave de forma segura

### Firebase API Key

1. Ve a la [Consola de Firebase](https://console.firebase.google.com/)
2. Selecciona tu proyecto o crea uno nuevo
3. Ve a Configuración del proyecto (⚙️ > Configuración del proyecto)
4. En la sección "Tus apps", encuentra la API Key en la configuración de tu app web
5. Copia y guarda la clave de forma segura

## 📦 Paso 1: Conectar el Repositorio a Netlify

1. **Inicia sesión en Netlify**
   - Ve a [https://app.netlify.com/](https://app.netlify.com/)
   - Inicia sesión con tu cuenta de GitHub

2. **Importar el proyecto**
   - Haz clic en "Add new site" > "Import an existing project"
   - Selecciona "Deploy with GitHub"
   - Autoriza a Netlify a acceder a tu cuenta de GitHub
   - Busca y selecciona el repositorio `pako200586-eng/Apptolva`

3. **Configuración de Build**
   - **Branch to deploy:** `main` (o la rama que desees)
   - **Build command:** (ya configurado en `netlify.toml`)
   - **Publish directory:** (ya configurado en `netlify.toml`)
   - Haz clic en "Deploy site"

⚠️ **NOTA:** El primer despliegue fallará porque aún no has configurado las variables de entorno. Esto es esperado.

## 🔐 Paso 2: Configurar Variables de Entorno

Esta es la parte **MÁS IMPORTANTE** para la seguridad de tu aplicación.

### ⚠️ IMPORTANTE: NUNCA compartas estas claves públicamente

1. **Accede a la configuración del sitio**
   - En tu sitio de Netlify, ve a "Site settings"
   - Haz clic en "Environment variables" en el menú lateral

2. **Agregar GOOGLE_AI_API_KEY**
   - Haz clic en "Add a variable"
   - **Key:** `GOOGLE_AI_API_KEY`
   - **Value:** Pega tu API Key de Google Generative AI
   - **Scopes:** Selecciona "All deploy contexts" (o personaliza según necesites)
   - Haz clic en "Create variable"

3. **Agregar FIREBASE_API_KEY**
   - Haz clic en "Add a variable" nuevamente
   - **Key:** `FIREBASE_API_KEY`
   - **Value:** Pega tu API Key de Firebase
   - **Scopes:** Selecciona "All deploy contexts"
   - Haz clic en "Create variable"

4. **Verificar configuración**
   - Deberías ver ambas variables listadas
   - ✅ GOOGLE_AI_API_KEY
   - ✅ FIREBASE_API_KEY

## 🔄 Paso 3: Re-desplegar el Sitio

1. Ve a la pestaña "Deploys"
2. Haz clic en "Trigger deploy" > "Clear cache and deploy site"
3. Espera a que termine el proceso (generalmente toma 1-2 minutos)

## ✅ Paso 4: Verificar el Despliegue

Una vez completado el despliegue:

1. **Verifica el estado del build**
   - El build debería completarse sin errores
   - Busca los mensajes: "✅ GOOGLE_AI_API_KEY is configured" y "✅ FIREBASE_API_KEY is configured"

2. **Accede a tu sitio**
   - Haz clic en el enlace del sitio (algo como `https://tu-sitio.netlify.app`)
   - La aplicación debería cargar correctamente

3. **Prueba las funcionalidades**
   - Verifica que la autenticación con Firebase funcione
   - Verifica que las funciones de IA con Google Generative AI funcionen
   - Prueba la creación y almacenamiento de bitácoras

## 🎨 Paso 5: (Opcional) Configurar Dominio Personalizado

Si deseas usar un dominio propio:

1. Ve a "Domain settings" en Netlify
2. Haz clic en "Add custom domain"
3. Sigue las instrucciones para configurar tu dominio
4. Netlify configurará automáticamente HTTPS gratuito

## 🔒 Mejores Prácticas de Seguridad

### ✅ Hacer

- ✅ Configurar las API Keys SOLO en Netlify Dashboard (Variables de entorno)
- ✅ Usar diferentes claves para desarrollo y producción
- ✅ Rotar las claves periódicamente
- ✅ Limitar los permisos de las API Keys según sea necesario
- ✅ Revisar los logs de uso de las APIs regularmente

### ❌ NO Hacer

- ❌ NUNCA subir archivos `.env` al repositorio
- ❌ NUNCA compartir tus API Keys en issues, PRs o comentarios
- ❌ NUNCA hardcodear las claves directamente en el código
- ❌ NUNCA usar las mismas claves en múltiples proyectos
- ❌ NUNCA exponer las claves en el frontend sin protección

## 🛠️ Solución de Problemas

### El build falla con "Missing required environment variables"

**Solución:** Verifica que las variables de entorno estén correctamente configuradas en Netlify:
1. Ve a Site settings > Environment variables
2. Verifica que GOOGLE_AI_API_KEY y FIREBASE_API_KEY estén presentes
3. Re-despliega el sitio

### El sitio se despliega pero las funciones no funcionan

**Posibles causas:**
1. **API Keys incorrectas:** Verifica que las claves sean válidas y tengan los permisos necesarios
2. **Cuota excedida:** Verifica que no hayas excedido los límites de tu plan de Google AI o Firebase
3. **Configuración de Firebase:** Asegúrate de que tu proyecto de Firebase esté correctamente configurado

### Error 404 en rutas de la aplicación

**Solución:** El archivo `netlify.toml` ya incluye la configuración de SPA. Si aún tienes problemas:
1. Verifica que el archivo `netlify.toml` esté en la raíz del repositorio
2. Re-despliega el sitio

## 📊 Monitoreo y Mantenimiento

### Revisar Logs de Despliegue

1. Ve a la pestaña "Deploys" en Netlify
2. Haz clic en el despliegue más reciente
3. Revisa los logs para cualquier advertencia o error

### Actualizar la Aplicación

Cada vez que hagas cambios en el repositorio:
1. Haz commit y push a GitHub
2. Netlify automáticamente detectará los cambios y re-desplegará
3. Verifica el nuevo despliegue

### Rollback a una Versión Anterior

Si algo sale mal:
1. Ve a "Deploys"
2. Encuentra un despliegue anterior que funcionaba
3. Haz clic en "..." > "Publish deploy"

## 📞 Soporte

Si encuentras problemas:

1. **Revisa los logs:** Los logs de build en Netlify suelen indicar el problema
2. **Documentación de Netlify:** [https://docs.netlify.com/](https://docs.netlify.com/)
3. **Firebase Documentation:** [https://firebase.google.com/docs](https://firebase.google.com/docs)
4. **Google AI Documentation:** [https://ai.google.dev/docs](https://ai.google.dev/docs)

## 📝 Notas Adicionales

- El archivo `build.sh` se ejecuta automáticamente durante cada despliegue
- Los placeholders `__GOOGLE_AI_API_KEY__` y `__FIREBASE_API_KEY__` son reemplazados durante el build
- Netlify proporciona HTTPS gratuito y automático para todos los sitios
- Los archivos estáticos se cachean automáticamente para mejor rendimiento

## 🎉 ¡Listo!

Tu aplicación AppTolva debería estar funcionando correctamente en Netlify. Si todo está bien configurado, verás:

- ✅ Build exitoso
- ✅ Sitio accesible
- ✅ Autenticación funcionando
- ✅ IA generativa funcionando
- ✅ Bitácoras guardándose correctamente

---

**Última actualización:** 2026-02-16

**Versión:** 1.0.0
