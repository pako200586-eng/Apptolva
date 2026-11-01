import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const LIMITE_MENSAJE = 3500;

function respuesta(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function serviciosFirebase() {
  const emuladoresActivos = Boolean(
    process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST
  );
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson && !emuladoresActivos) {
    throw new Error('Falta configurar FIREBASE_SERVICE_ACCOUNT_JSON en Netlify.');
  }
  const serviceAccount = serviceAccountJson ? JSON.parse(serviceAccountJson) : null;
  if (serviceAccount?.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
  const appOptions = {
    projectId: serviceAccount?.project_id || process.env.GCLOUD_PROJECT || 'demo-apptolva'
  };
  if (serviceAccount) appOptions.credential = cert(serviceAccount);
  const app = getApps()[0] || initializeApp(appOptions);
  return { auth: getAuth(app), db: getFirestore(app) };
}

async function esAdministrador(request) {
  const token = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return false;
  const { auth, db } = serviciosFirebase();
  const identidad = await auth.verifyIdToken(token);
  const correo = String(identidad.email || '').trim().toLowerCase();
  if (!correo) return false;
  const usuario = await db.collection('usuarios').doc(correo).get();
  return usuario.exists && usuario.get('rol') === 'admin';
}

export default async function handler(request) {
  if (request.method !== 'POST') return respuesta(405, { error: 'Método no permitido' });

  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return respuesta(500, { error: 'Telegram no configurado en variables de entorno' });
  }

  try {
    if (!(await esAdministrador(request))) return respuesta(403, { error: 'No autorizado' });
  } catch (error) {
    console.error('Error de autenticación:', error?.message);
    return respuesta(401, { error: 'Sesión inválida' });
  }

  let mensaje;
  try {
    ({ mensaje } = await request.json());
  } catch {
    return respuesta(400, { error: 'JSON inválido' });
  }
  if (typeof mensaje !== 'string' || !mensaje.trim() || mensaje.length > LIMITE_MENSAJE) {
    return respuesta(400, { error: 'Mensaje inválido' });
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: mensaje,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    if (!resp.ok) {
      console.error('Error desde Telegram API:', resp.status);
      return respuesta(502, { error: `Error Telegram: ${resp.status}` });
    }
    return respuesta(200, { ok: true });
  } catch (error) {
    console.error('Error de red al conectar con Telegram:', error?.message);
    return respuesta(500, { error: 'Fallo interno al despachar alerta' });
  }
}
