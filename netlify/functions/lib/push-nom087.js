import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import webpush from 'web-push';

const COLECCION = 'alertas_nom087';
const MAX_RETRASO_MS = 10 * 60 * 1000;
const CADUCIDAD_MS = 2 * 60 * 60 * 1000;

const AVISOS = [
  {
    campo: 'fire_at_270',
    enviado: 'sent_270',
    mensaje: {
      title: '⚠️ 4 h 30 min de manejo continuo',
      body: 'Te quedan menos de 30 minutos para la pausa obligatoria. Busca un paradero seguro.',
      tag: 'limite-4h30'
    }
  },
  {
    campo: 'fire_at_300',
    enviado: 'sent_300',
    mensaje: {
      title: '🚨 Límite NOM-087: 5 horas de manejo continuo',
      body: 'Detente y registra una pausa de 30 minutos ahora.',
      tag: 'limite-5h'
    }
  }
];

export function dbFirestore() {
  const emuladorActivo = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson && !emuladorActivo) {
    throw new Error('Falta configurar FIREBASE_SERVICE_ACCOUNT_JSON en Netlify.');
  }
  const serviceAccount = serviceAccountJson ? JSON.parse(serviceAccountJson) : null;
  if (serviceAccount?.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
  const opciones = { projectId: serviceAccount?.project_id || process.env.GCLOUD_PROJECT || 'demo-apptolva' };
  if (serviceAccount) opciones.credential = cert(serviceAccount);
  return getFirestore(getApps()[0] || initializeApp(opciones));
}

export function enviadorWebPush(env = process.env) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    throw new Error('Faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT en Netlify.');
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return (suscripcion, carga) => webpush.sendNotification(suscripcion, JSON.stringify(carga), {
    TTL: 600,
    urgency: 'high'
  });
}

// Envía los avisos vencidos de 4 h 30 min y 5 h. Idempotente: marca cada aviso antes de enviarlo.
export async function procesarAlertasPush({ db, enviar, ahora = Date.now() }) {
  const resumen = { revisadas: 0, enviadas: 0, omitidas: 0, eliminadas: 0, errores: 0 };
  const vencidas = await db.collection(COLECCION).where('fire_at_270', '<=', ahora).get();

  for (const snap of vencidas.docs) {
    resumen.revisadas += 1;
    const datos = snap.data();

    if (ahora - datos.fire_at_300 > CADUCIDAD_MS) {
      await snap.ref.delete();
      resumen.eliminadas += 1;
      continue;
    }

    let eliminada = false;
    for (const aviso of AVISOS) {
      if (datos[aviso.campo] > ahora || datos[aviso.enviado]) continue;

      const reclamado = await db.runTransaction(async (tx) => {
        const actual = await tx.get(snap.ref);
        if (!actual.exists || actual.get(aviso.enviado)) return false;
        tx.update(snap.ref, { [aviso.enviado]: true });
        return true;
      });
      if (!reclamado) continue;

      if (ahora - datos[aviso.campo] > MAX_RETRASO_MS) {
        resumen.omitidas += 1;
        continue;
      }

      try {
        await enviar(datos.subscription, { ...aviso.mensaje, fireAt: datos[aviso.campo], ts: ahora });
        resumen.enviadas += 1;
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await snap.ref.delete();
          resumen.eliminadas += 1;
          eliminada = true;
          break;
        }
        resumen.errores += 1;
        console.error('Error enviando push NOM-087:', error?.statusCode || error?.message);
      }
    }

    if (!eliminada && datos.fire_at_300 <= ahora) {
      await snap.ref.delete();
      resumen.eliminadas += 1;
    }
  }
  return resumen;
}
