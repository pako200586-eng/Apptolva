import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearHandlerGemini, DEFAULT_MODEL, resolverModelo } from '../netlify/functions/gemini.js';

function crearContexto({
  identidad = { uid: 'uid-op-1', email: '221417@apptolva.com', firebase: { sign_in_provider: 'password' } },
  verifyError = null,
  perfil = { rol: 'operador', uid: 'uid-op-1', activo: true, estatus: 'activo' },
  env = { GEMINI_API_KEY: 'clave-prueba' },
  fetchStatus = 200,
  fetchBody = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Respuesta técnica' }] } }] })
} = {}) {
  const fetchCalls = [];
  const verifyCalls = [];
  const handler = crearHandlerGemini({
    obtenerServicios: () => ({
      auth: {
        verifyIdToken: async (token, checkRevoked) => {
          verifyCalls.push({ token, checkRevoked });
          if (verifyError) throw verifyError;
          return identidad;
        }
      },
      db: {
        collection: (col) => ({
          doc: (id) => ({
            get: async () => ({
              exists: Boolean(perfil) && col === 'usuarios' && id === String(identidad?.email || '').toLowerCase(),
              data: () => perfil
            })
          })
        })
      }
    }),
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options });
      return new Response(fetchBody, { status: fetchStatus, headers: { 'Content-Type': 'application/json' } });
    },
    getEnv: () => env
  });
  return { handler, fetchCalls, verifyCalls };
}

function peticion(body = { mensaje: 'Presión de aceite DD16' }, { method = 'POST', token = 'token-valido' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://apptolva.test/.netlify/functions/gemini', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined
  });
}

test('gemini rechaza métodos distintos a POST con 405', async () => {
  const { handler, fetchCalls } = crearContexto();
  const res = await handler(peticion(null, { method: 'GET' }));
  assert.equal(res.status, 405);
  assert.equal(fetchCalls.length, 0);
});

test('gemini devuelve 401 sin token o con token inválido/revocado sin consultar la IA', async () => {
  const sinToken = crearContexto();
  const r1 = await sinToken.handler(peticion({ mensaje: 'hola' }, { token: '' }));
  assert.equal(r1.status, 401);
  assert.equal(sinToken.fetchCalls.length, 0);

  const errRevocado = Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' });
  const revocado = crearContexto({ verifyError: errRevocado });
  const r2 = await revocado.handler(peticion({ mensaje: 'hola' }, { token: 'token-revocado' }));
  assert.equal(r2.status, 401);
  assert.equal(revocado.verifyCalls[0].checkRevoked, true);
  assert.equal(revocado.fetchCalls.length, 0);
});

test('gemini devuelve 403 para usuarios anónimos, sin rol o dados de baja', async () => {
  const anonimo = crearContexto({
    identidad: { uid: 'anon-1', firebase: { sign_in_provider: 'anonymous' } }
  });
  assert.equal((await anonimo.handler(peticion())).status, 403);
  assert.equal(anonimo.fetchCalls.length, 0);

  const inactivo = crearContexto({
    perfil: { rol: 'operador', uid: 'uid-op-1', activo: false, estatus: 'activo' }
  });
  assert.equal((await inactivo.handler(peticion())).status, 403);

  const baja = crearContexto({
    perfil: { rol: 'operador', uid: 'uid-op-1', activo: true, estatus: 'baja' }
  });
  assert.equal((await baja.handler(peticion())).status, 403);

  const uidDistinto = crearContexto({
    perfil: { rol: 'operador', uid: 'otro-uid', activo: true, estatus: 'activo' }
  });
  assert.equal((await uidDistinto.handler(peticion())).status, 403);

  const sinPerfil = crearContexto({ perfil: null });
  assert.equal((await sinPerfil.handler(peticion())).status, 403);
});

test('gemini valida el identificador de modelo y responde 200 a usuarios activos autorizados', async () => {
  assert.equal(resolverModelo({}), DEFAULT_MODEL);
  assert.equal(resolverModelo({ GEMINI_MODEL: 'gemini-2.5-flash' }), 'gemini-2.5-flash');
  assert.equal(resolverModelo({ GEMINI_MODEL: '../otro/modelo' }), null);
  assert.equal(resolverModelo({ GEMINI_MODEL: 'gpt-4o' }), null);

  const modeloInvalido = crearContexto({
    env: { GEMINI_API_KEY: 'clave-prueba', GEMINI_MODEL: '../inyeccion' }
  });
  const rInvalido = await modeloInvalido.handler(peticion());
  assert.equal(rInvalido.status, 500);
  assert.equal(modeloInvalido.fetchCalls.length, 0);

  const ok = crearContexto();
  const res = await ok.handler(peticion({ mensaje: 'Cople degollado en descarga' }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(ok.fetchCalls.length, 1);
  assert.match(ok.fetchCalls[0].url, new RegExp(`/models/${DEFAULT_MODEL}:generateContent$`));
  assert.equal(ok.fetchCalls[0].options.headers['x-goog-api-key'], 'clave-prueba');
  const data = await res.json();
  assert.equal(data.candidates[0].content.parts[0].text, 'Respuesta técnica');
});

test('index.html envía Authorization Bearer en sendAI y employee_number en checklists', () => {
  const indexHtml = readFileSync(new URL('../apptolva_bitacora/index.html', import.meta.url), 'utf8');
  const sendAi = indexHtml.slice(indexHtml.indexOf('async function sendAI()'), indexHtml.indexOf('function formatText('));
  assert.match(sendAi, /obtenerTokenAuth/);
  assert.match(sendAi, /'Authorization': `Bearer \$\{token\}`/);

  const guardarChecklist = indexHtml.slice(
    indexHtml.indexOf('window.guardarReporteEnFirestore = async function'),
    indexHtml.indexOf('async function escribirReporte(')
  );
  assert.match(guardarChecklist, /employee_number:\s*reportePayload\.employeeNumber\s*\|\|\s*""/);
});
