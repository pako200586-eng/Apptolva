import { dbFirestore, enviadorWebPush, procesarAlertasPush } from './lib/push-nom087.js';

// Netlify solo ejecuta funciones programadas en el deploy de producción publicado.
export default async function handler() {
  const resumen = await procesarAlertasPush({ db: dbFirestore(), enviar: enviadorWebPush() });
  console.log('Alertas push NOM-087:', JSON.stringify(resumen));
}

export const config = { schedule: '* * * * *' };
