import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const DEFAULT_MODEL = "gemini-3.8-flash";
export const MODEL_ID_REGEX = /^gemini-[a-z0-9][a-z0-9._-]{0,60}$/i;
const MAX_BODY_CHARS = 8 * 1024;
const MAX_MENSAJE_CHARS = 2000;
const ROLES_AUTORIZADOS = new Set(["operador", "master", "admin", "lectura"]);
const CODIGOS_TOKEN_INVALIDO = new Set([
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/invalid-id-token",
  "auth/argument-error",
  "auth/user-disabled",
]);

const SYSTEM_PROMPT = `
Eres el Asistente Técnico y Maestro Mecánico de AppTolva para Flota Pesada T3-S2-R4 en Grupo Bachoco (Planta PA Chapo).
Tu conocimiento cubre dos pilares absolutos: (1) Motor Detroit Diesel DD16 / Freightliner New Cascadia y (2) Carro-Tolvas de Alimento Balanceado.

REGLAS DE RESPUESTA:
- Responde conciso, directo al grano y con pasos numerados.
- Habla como un mecánico máster de patio: técnico, firme y práctico, sin rodeos ni explicaciones innecesarias.
- Si el operador describe un síntoma o código, dale el diagnóstico probable, la acción inmediata de seguridad y la solución en taller.

CONOCIMIENTO CLAVE 1: MOTOR DETROIT DIESEL DD16 (NEW CASCADIA)
- Rango Operativo: Ralentí 600 RPM. Rango de torque óptimo 975 - 1,400 RPM. Para descarga PTO: 950 - 1,100 RPM.
- Presión de Aceite (10W-30 / 15W-40 CK-4): 40-60 PSI en carretera. Mínimo caliente en ralentí: 14 PSI. Abajo de 14 PSI es paro inmediato.
- Temperatura Refrigerante: Normal 88°C a 98°C (190°F - 208°F). El fan clutch entra a ~100-102°C. Si pasa de 105°C advertir apagado de A/C y reducción de marcha.
- Sistema de Postratamiento (ATS / 1-Box / Urea-DEF):
  * Testigo DPF Fijo: Requiere regeneración pasiva en carretera abierta.
  * Testigo DPF Parpadeando: Requiere regeneración estacionaria urgente (estacionar, neutro, freno de mano, temp > 65°C, activar switch).
  * Testigo DPF + Check Engine: Derate (pérdida de potencia al 25%) inminente.
  * Fallas de Urea: Cristalización en inyector dosificador, sensor NOx cruzado o calidad de DEF degradada.
- Combustible Common Rail (ACRS): Presión hasta 2,900 bar. Tironeos o cascabeleo suelen ser aire en circuito o filtros primario/secundario tapados.
- Freno de Motor Jacobs: 3 pasos (2, 4 y 6 cilindros). No activar en piso resbaloso ni con embrague presionado.
- Embrague / Transmisión: Si el pedal no corta o truena, revisar varillaje, horquilla, bombín hidráulico de clutch y juego libre del collarín.

CONOCIMIENTO CLAVE 2: CARRO-TOLVAS Y SISTEMA HIDRÁULICO DE DESCARGA
- Presión Hidráulica Normal: 1,500 a 2,000 PSI en el manómetro. ¡PELIGRO si sube a más de 2,200 PSI! (Riesgo de reventón de mangueras; cerrar compuerta de arrastre de inmediato).
- Secuencia de Arranque:
  1. Conectar mangueras en frío/neutro y desinflar suspensión de aire.
  2. Activar PTO (Toma de Fuerza) a 950 - 1,100 RPM.
  3. Levantar y orientar pluma (alejado mínimo 10 metros de cables de alta tensión; no tocar bocas de silo).
  4. Encender tornillo sinfín vertical / pluma (Palanca 4).
  5. Abrir compuerta trasera y encender gusano de arrastre (Palanca 3).
  6. Regular flujo observando manómetro de presión.
- Secuencia de Apagado: Inversa obligatoria (Apagar arrastre 3 -> dejar vaciar pluma -> apagar sinfín 4 -> bajar RPM a ralentí -> desactivar PTO -> asegurar pluma en silleta con pernos).
- Diagnóstico Clave: Si el motor hidráulico zumba pero el gusano no gira, el cople fusible mecánico se degolló por sobrecarga o apelmazamiento. Apagar PTO de inmediato, despresurizar y cambiar cople (no forzar aceleración).
`;

const jsonResponse = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

function serviciosFirebase() {
  const emuladoresActivos = Boolean(
    process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST
  );
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson && !emuladoresActivos) {
    throw new Error("Falta configurar FIREBASE_SERVICE_ACCOUNT_JSON en Netlify.");
  }
  const serviceAccount = serviceAccountJson ? JSON.parse(serviceAccountJson) : null;
  if (serviceAccount?.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }
  const appOptions = {
    projectId: serviceAccount?.project_id || process.env.GCLOUD_PROJECT || "demo-apptolva",
  };
  if (serviceAccount) appOptions.credential = cert(serviceAccount);
  const app = getApps()[0] || initializeApp(appOptions);
  return { auth: getAuth(app), db: getFirestore(app) };
}

async function verificarUsuarioAutorizado(req, obtenerServicios) {
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return { ok: false, status: 401, error: "Se requiere iniciar sesión para consultar el asistente." };
  }

  let auth;
  let db;
  try {
    ({ auth, db } = obtenerServicios());
  } catch (error) {
    console.error("Error configurando Firebase Admin en gemini:", error?.message);
    return { ok: false, status: 500, error: "Servicio de autenticación no configurado." };
  }

  let identidad;
  try {
    identidad = await auth.verifyIdToken(token, true);
  } catch (error) {
    console.warn("Token inválido en gemini:", error?.code || error?.message);
    const esErrorToken = CODIGOS_TOKEN_INVALIDO.has(error?.code)
      || String(error?.code || "").startsWith("auth/");
    return {
      ok: false,
      status: esErrorToken ? 401 : 500,
      error: esErrorToken
        ? "Sesión inválida o expirada. Inicia sesión nuevamente."
        : "No se pudo verificar la sesión."
    };
  }

  const provider = identidad?.firebase?.sign_in_provider;
  const correo = String(identidad?.email || "").trim().toLowerCase();
  if (provider !== "password" || !correo) {
    return { ok: false, status: 403, error: "Se requiere una cuenta autorizada de AppTolva." };
  }

  try {
    const perfil = await db.collection("usuarios").doc(correo).get();
    const data = perfil.exists ? perfil.data() : null;
    const activo = Boolean(data)
      && ROLES_AUTORIZADOS.has(data.rol)
      && data.activo !== false
      && data.estatus !== "baja"
      && (!data.uid || data.uid === identidad.uid);
    if (!activo) {
      return { ok: false, status: 403, error: "Cuenta sin permiso o dada de baja." };
    }
    return { ok: true, uid: identidad.uid, correo, rol: data.rol };
  } catch (error) {
    console.error("Error validando perfil en gemini:", error?.message);
    return { ok: false, status: 500, error: "No se pudo validar la cuenta." };
  }
}

export function resolverModelo(env = process.env) {
  const model = String(env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  return MODEL_ID_REGEX.test(model) ? model : null;
}

export function crearHandlerGemini({
  obtenerServicios = serviciosFirebase,
  fetchImpl = fetch,
  getEnv = () => process.env,
} = {}) {
  return async (req) => {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Método no permitido" }, 405);
    }

    const sesion = await verificarUsuarioAutorizado(req, obtenerServicios);
    if (!sesion.ok) {
      return jsonResponse({ error: sesion.error }, sesion.status);
    }

    let mensaje;
    try {
      const raw = await req.text();
      if (raw.length > MAX_BODY_CHARS) {
        return jsonResponse({ error: "Solicitud demasiado grande" }, 413);
      }
      const data = JSON.parse(raw);
      mensaje = typeof data.mensaje === "string" ? data.mensaje.trim() : "";
    } catch {
      return jsonResponse({ error: "JSON inválido" }, 400);
    }

    if (!mensaje) {
      return jsonResponse({ error: "Falta el campo 'mensaje'" }, 400);
    }
    if (mensaje.length > MAX_MENSAJE_CHARS) {
      return jsonResponse(
        { error: `El mensaje excede ${MAX_MENSAJE_CHARS} caracteres` },
        413
      );
    }

    const env = getEnv();
    const model = resolverModelo(env);
    if (!model) {
      return jsonResponse({ error: "Modelo de IA configurado no es válido" }, 500);
    }

    const gatewayKey = (env.GEMINI_API_KEY || "").trim();
    const gatewayBase = env.GOOGLE_GEMINI_BASE_URL;
    const directKey = (
      env.GOOGLE_AI_API_KEY || env.AI_API_KEY || gatewayKey
    ).trim();

    const useGateway = Boolean(gatewayKey && gatewayBase);
    const apiKey = useGateway ? gatewayKey : directKey;
    const baseUrl = useGateway
      ? gatewayBase.replace(/\/+$/, "")
      : "https://generativelanguage.googleapis.com/v1beta";

    if (!apiKey) {
      return jsonResponse({ error: "AI provider not configured" }, 500);
    }

    // El prompt del sistema se inyecta aquí para que nunca viaje al navegador.
    const payload = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: mensaje }] }],
    };

    try {
      // La clave va en el header, no en la URL, para que no quede en logs ni trazas.
      const url = `${baseUrl}/models/${model}:generateContent`;

      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();

      if (!response.ok) {
        console.error(`Gemini API error ${response.status}: ${responseText}`);
        return jsonResponse(
          { error: `Fallo upstream de IA (${response.status})` },
          502
        );
      }

      return new Response(responseText, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      console.error("Gemini function error:", error);
      return jsonResponse({ error: "Error interno al consultar la IA" }, 500);
    }
  };
}

const defaultHandler = crearHandlerGemini();
export default async (req) => defaultHandler(req);
