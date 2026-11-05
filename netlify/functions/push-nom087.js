import { timingSafeEqual } from 'node:crypto';
import { dbFirestore, enviadorWebPush, procesarAlertasPush } from './lib/push-nom087.js';

function respuesta(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function secretoValido(request) {
  const esperado = process.env.PUSH_CRON_SECRET || '';
  const recibido = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return esperado.length >= 16 && a.length === b.length && timingSafeEqual(a, b);
}

// Disparador HTTP para entornos donde Netlify no ejecuta funciones programadas (staging / branch deploys).
// Un cron externo debe llamarlo cada minuto con: Authorization: Bearer <PUSH_CRON_SECRET>.
export default async function handler(request) {
  if (request.method !== 'POST') return respuesta(405, { error: 'Método no permitido' });
  if (!secretoValido(request)) return respuesta(403, { error: 'No autorizado' });

  try {
    const resumen = await procesarAlertasPush({ db: dbFirestore(), enviar: enviadorWebPush() });
    return respuesta(200, resumen);
  } catch (error) {
    console.error('Error procesando alertas push:', error?.message);
    return respuesta(500, { error: 'No se pudieron procesar las alertas' });
  }
}
