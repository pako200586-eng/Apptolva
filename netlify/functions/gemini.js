const MODEL = "gemini-2.5-flash";
const MAX_BODY_CHARS = 8 * 1024;
const MAX_MENSAJE_CHARS = 2000;

const SYSTEM_PROMPT = `
Eres el Asistente Técnico y Maestro Mecánico de AppTolva para Flota Pesada T3-S2-R4 en Grupo Bachoco (Planta PA Chapo).
Tu conocimiento cubre dos pilares absolutos: (1) Motor Detroit Diesel DD16 / Freightliner New Cascadia y (2) Carro-Tolvas de Alimento Balanceado.

REGLAS DE RESPUESTA:
- Responde conciso, directo al grano y con pasos numerados.
- Habla como un mecánico máster de patio: técnico, firme y práctico, sin rodeos ni explicaciones innecesarias.
- Si el operador describe un síntoma o código, dale el diagnóstico probable, la acción inmediata de seguridad y la solución en taller.

CONOCIMIENTO CLAVE 1: MOTOR DETROIT DIESEL DD16 (NEW CASCADIA)
- Rango Operativo: Ralentí 600 RPM. Rango de torque óptimo 975 - 1,400 RPM. Para descarga PTO: 950 - 1,100 RPM.
- Presión de Aceite (10W-30 / 15W-40 CK-4): 40-60 PSI en carretera. Mínimo caliente en ralentí: 12-15 PSI. Abajo de 10 PSI es paro inmediato.
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
  2. Activar PTO (Toma de Fuerza) a 950 - 1,050 RPM.
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
    headers: { "Content-Type": "application/json" },
  });

export default async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido" }, 405);
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

  const gatewayKey = process.env.GEMINI_API_KEY;
  const gatewayBase = process.env.GOOGLE_GEMINI_BASE_URL;
  const directKey = process.env.GOOGLE_AI_API_KEY || process.env.AI_API_KEY || gatewayKey;

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
    const url = `${baseUrl}/models/${MODEL}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Gemini function error:", error);
    return jsonResponse({ error: "Error interno al consultar la IA" }, 500);
  }
};
