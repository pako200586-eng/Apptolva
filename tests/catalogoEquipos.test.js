import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as catalogoEquipos from '../apptolva_bitacora/js/catalogoEquipos.js';
import {
  CATALOGO_SEMILLA,
  ESTADOS_EQUIPO,
  TIPOS_EQUIPO,
  activosPorTipo,
  equiposFaltantes,
  normalizarEconomico,
  puedeAdministrarCatalogo,
  validarCatalogo,
  validarEquipo,
  validarTrenDeCarga
} from '../apptolva_bitacora/js/catalogoEquipos.js';
import { crearFirmaFalla } from '../apptolva_bitacora/js/firmaFalla.js';

const contar = (tipo) => CATALOGO_SEMILLA.filter((equipo) => equipo.tipo === tipo).length;
const tren = { modalidad: 'full', tracto: '13817', tolva1: '14109', dolly: '14148', tolva2: '14110' };

test('solo el administrador responsable gestiona el catálogo, independientemente de Netlify', () => {
  assert.equal(puedeAdministrarCatalogo('admin', 'FRANK@APPTOLVA.COM'), true);
  assert.equal(puedeAdministrarCatalogo('admin', 'otro@example.test'), false);
  assert.equal(puedeAdministrarCatalogo('master', 'frank@apptolva.com'), false);
  assert.equal(puedeAdministrarCatalogo('operador', 'frank@apptolva.com'), false);
  assert.equal(puedeAdministrarCatalogo('admin', null), false);
});

test('el panel aplica los permisos de catálogo y operaciones sensibles por separado', () => {
  const html = readFileSync(new URL('../apptolva_bitacora/admin.html', import.meta.url), 'utf8');
  const imported = html.match(/import\s*{([^}]+)}\s*from\s*["']\.\/js\/catalogoEquipos\.js["'];/);
  const start = html.indexOf('    function aplicarPermisosDeInterfaz()');
  const end = html.indexOf('    function reportRowHtml(', start);
  assert.ok(imported && start !== -1 && end !== -1);

  function element(hidden = false) {
    const classes = new Set(hidden ? ['hidden'] : []);
    return {
      classList: {
        add: name => classes.add(name),
        contains: name => classes.has(name),
        toggle: (name, force) => force ? classes.add(name) : classes.delete(name)
      },
      click() {}
    };
  }
  const ids = ['gestion-operadores', 'depurarFallasBtn', 'auditFirestoreBtn', 'backupFirestoreBtn', 'btn-vista-catalogo',
    'vista-catalogo', 'btn-vista-ranking', 'vista-ranking', 'btn-vista-reportes', 'cargarMasAntiguos',
    'firestoreAudit', 'downloadFirestoreAudit'];
  const elements = Object.fromEntries(ids.map(id => [id, element(id === 'vista-catalogo' || id === 'vista-ranking' || id === 'btn-vista-ranking')]));
  const adminButton = element();
  const input = {};
  const state = { role: 'admin', user: { email: 'frank@apptolva.com' }, operacionesSensibles: false, rankingSemanal: false, windowDays: 30 };
  const context = vm.createContext({
    catalogoEquipos, state, firebaseConfig: { projectId: 'apptolva-staging' }, $: id => elements[id], VENTANA_PASO_DIAS: 7,
    document: { querySelectorAll: selector => selector === '.btn-accion-admin' ? [adminButton] : [input] }
  });
  vm.runInContext(
    `const {${imported[1]}} = catalogoEquipos; let ultimoInventarioFirestore = null;\n` +
    html.slice(start, end),
    context
  );
  const hidden = id => elements[id].classList.contains('hidden');

  context.aplicarPermisosDeInterfaz();
  assert.equal(hidden('btn-vista-catalogo'), false);
  assert.equal(hidden('depurarFallasBtn'), true);
  assert.equal(hidden('auditFirestoreBtn'), true);
  assert.equal(hidden('backupFirestoreBtn'), true);
  assert.equal(hidden('btn-vista-ranking'), true);
  assert.equal(hidden('gestion-operadores'), true);
  assert.equal(input.disabled, false);

  state.operacionesSensibles = true;
  state.rankingSemanal = true;
  context.aplicarPermisosDeInterfaz();
  assert.equal(hidden('depurarFallasBtn'), false);
  assert.equal(hidden('auditFirestoreBtn'), false);
  assert.equal(hidden('backupFirestoreBtn'), false);
  assert.equal(hidden('btn-vista-ranking'), false);
  assert.equal(hidden('gestion-operadores'), false);
  context.firebaseConfig.projectId = 'gen-lang-client-0015118308';
  context.aplicarPermisosDeInterfaz();
  assert.equal(hidden('gestion-operadores'), false);
  state.operacionesSensibles = false;
  context.aplicarPermisosDeInterfaz();
  assert.equal(hidden('gestion-operadores'), true);
  state.operacionesSensibles = true;
  context.firebaseConfig.projectId = 'production';
  context.aplicarPermisosDeInterfaz();
  assert.equal(hidden('gestion-operadores'), true);
  context.firebaseConfig.projectId = 'apptolva-staging';

  state.user.email = 'otro@example.test';
  state.operacionesSensibles = false;
  state.rankingSemanal = false;
  context.aplicarPermisosDeInterfaz();
  assert.equal(hidden('btn-vista-catalogo'), true);
  assert.equal(hidden('depurarFallasBtn'), true);
  assert.equal(hidden('btn-vista-ranking'), true);

  state.role = 'lectura';
  state.user.email = 'frank@apptolva.com';
  context.aplicarPermisosDeInterfaz();
  assert.equal(hidden('btn-vista-catalogo'), true);
  assert.equal(adminButton.classList.contains('hidden'), true);
  assert.equal(input.disabled, true);
});

test('la semilla confirmada es consistente y no tiene duplicados', () => {
  assert.deepEqual(validarCatalogo(CATALOGO_SEMILLA), []);
  assert.equal(contar(TIPOS_EQUIPO.TRACTO), 17);
  assert.equal(contar(TIPOS_EQUIPO.TOLVA), 34);
  assert.equal(contar(TIPOS_EQUIPO.DOLLY), 15);
  assert.equal(CATALOGO_SEMILLA.length, 66);
});

test('la tolva 14097 conserva su propio número económico', () => {
  const tolva = CATALOGO_SEMILLA.find((equipo) => equipo.id === 'tolva_14097');
  assert.equal(tolva?.economico, '14097');
  assert.equal(CATALOGO_SEMILLA.filter((equipo) => equipo.economico === '14096').length, 1);
});

test('validarCatalogo detecta duplicados, ids incoherentes y valores inválidos', () => {
  const base = { id: 'dolly_1', economico: '1', display: 'T1', tipo: 'dolly', estado: 'activo' };
  assert.ok(validarCatalogo([]).length);
  assert.ok(validarCatalogo([base, base]).some((error) => error.includes('duplicado')));
  assert.ok(validarCatalogo([{ ...base, id: 'dolly_2' }]).some((error) => error.includes('no coincide')));
  assert.ok(validarCatalogo([{ ...base, estado: 'perdido' }]).some((error) => error.includes('estado')));
  assert.ok(validarCatalogo([{ ...base, tipo: 'avion', id: 'avion_1' }]).some((error) => error.includes('tipo')));
  assert.ok(validarCatalogo([{ ...base, economico: 'AB', id: 'dolly_AB' }]).some((error) => error.includes('numérico')));
});

test('normalizarEconomico acepta variantes de captura sin alterar el número', () => {
  assert.equal(normalizarEconomico(' T14148 '), '14148');
  assert.equal(normalizarEconomico('t 14148'), '14148');
  assert.equal(normalizarEconomico('14148'), '14148');
  assert.equal(normalizarEconomico(null), '');
  assert.equal(normalizarEconomico('14148A'), '14148A');
});

test('activosPorTipo solo devuelve equipos activos del tipo pedido, ordenados', () => {
  const equipos = [
    { id: 'dolly_3', economico: '3', tipo: 'dolly', estado: 'activo' },
    { id: 'dolly_1', economico: '1', tipo: 'dolly', estado: 'activo' },
    { id: 'dolly_2', economico: '2', tipo: 'dolly', estado: ESTADOS_EQUIPO.TALLER },
    { id: 'tolva_9', economico: '9', tipo: 'tolva', estado: 'activo' }
  ];
  assert.deepEqual(activosPorTipo(equipos, 'dolly').map((equipo) => equipo.economico), ['1', '3']);
});

test('un equipo existente debe estar activo; uno desconocido requiere motivo', () => {
  const equipos = [
    ...CATALOGO_SEMILLA,
    { id: 'dolly_14199', economico: '14199', display: 'T14199', tipo: 'dolly', estado: ESTADOS_EQUIPO.TALLER }
  ];
  assert.equal(validarEquipo(equipos, 'dolly', 'T14148', 'Dolly').ok, true);
  assert.match(validarEquipo(equipos, 'dolly', '14199', 'Dolly').error, /taller/);
  assert.match(validarEquipo(equipos, 'dolly', '99999', 'Dolly').error, /no está en el catálogo/);
  assert.equal(validarEquipo(equipos, 'dolly', '', 'Dolly').ok, false);

  const conMotivo = validarEquipo(equipos, 'dolly', '99999', 'Dolly', 'Relevo de otra planta');
  assert.equal(conMotivo.ok, true);
  assert.equal(conMotivo.noCatalogado, true);
  assert.equal(validarEquipo(equipos, 'dolly', 'ABC', 'Dolly', 'Relevo').ok, false);
  assert.equal(validarEquipo(equipos, 'dolly', '14199', 'Dolly', 'Relevo').ok, false);
});

test('el mismo número no se acepta como otro tipo de equipo', () => {
  assert.equal(validarEquipo(CATALOGO_SEMILLA, 'dolly', '14109', 'Dolly').ok, false);
  assert.equal(validarEquipo(CATALOGO_SEMILLA, 'tolva', '14109', 'Tolva').ok, true);
});

test('el tren completo valida cada componente y devuelve números canónicos', () => {
  const resultado = validarTrenDeCarga(CATALOGO_SEMILLA, { ...tren, tracto: 'T13817', dolly: ' 14148' });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.valores, { tracto: '13817', tolva1: '14109', dolly: '14148', tolva2: '14110' });
  assert.deepEqual(resultado.noCatalogados, []);
});

test('la modalidad sencilla no exige dolly ni segunda tolva', () => {
  const resultado = validarTrenDeCarga(CATALOGO_SEMILLA, { modalidad: 'sencillo', tracto: '13817', tolva1: '14109', dolly: '', tolva2: '' });
  assert.equal(resultado.ok, true);
  assert.deepEqual(Object.keys(resultado.valores), ['tracto', 'tolva1']);
});

test('el tren completo exige todos los componentes y rechaza tolvas repetidas', () => {
  const faltante = validarTrenDeCarga(CATALOGO_SEMILLA, { ...tren, dolly: '' });
  assert.equal(faltante.ok, false);
  assert.equal(faltante.errores.length, 1);

  const repetida = validarTrenDeCarga(CATALOGO_SEMILLA, { ...tren, tolva2: '14109' });
  assert.equal(repetida.ok, false);
  assert.ok(repetida.errores.some((error) => error.includes('mismo equipo')));
});

test('un equipo no registrado queda registrado con su motivo', () => {
  const resultado = validarTrenDeCarga(CATALOGO_SEMILLA, { ...tren, dolly: '99999', motivoExcepcion: ' Relevo foráneo ' });
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.noCatalogados, [{ componente: 'dolly', economico: '99999', motivo: 'Relevo foráneo' }]);
});

test('el mismo dolly conserva su firma aunque cambie el tracto que lo arrastra', () => {
  const firma = (tracto) => {
    const { valores } = validarTrenDeCarga(CATALOGO_SEMILLA, { ...tren, tracto });
    return crearFirmaFalla({ unidad: valores.dolly, componente: 'dolly', sistema: 'ELÉCTRICO', item: 'Luces en general' });
  };
  assert.equal(firma('13817'), firma('14123'));
});

test('equiposFaltantes devuelve solo lo que aún no está cargado', () => {
  assert.equal(equiposFaltantes([]).length, 66);
  assert.equal(equiposFaltantes(CATALOGO_SEMILLA).length, 0);
  assert.deepEqual(equiposFaltantes(CATALOGO_SEMILLA.slice(1)).map((equipo) => equipo.id), [CATALOGO_SEMILLA[0].id]);
});
