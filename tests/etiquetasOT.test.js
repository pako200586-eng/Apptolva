import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const contexto = { window: {} };
vm.runInNewContext(readFileSync(new URL('../apptolva_bitacora/js/etiquetasOT.js', import.meta.url), 'utf8'), contexto);
const e = contexto.window.etiquetasOT;

const payload = { unitId: '14121', tolva1: '14091', dolly: '14147', tolva2: '14110' };

test('etiqueta con económico real', () => {
  assert.equal(e.etiquetaComponente('1ra TOLVA', payload), 'Tolva 14091 (1ra)');
  assert.equal(e.etiquetaComponente('2da TOLVA', payload), 'Tolva 14110 (2da)');
  assert.equal(e.etiquetaComponente('DOLLY', payload), 'Dolly 14147');
  assert.equal(e.etiquetaComponente('TRACTOCAMIÓN', payload), 'Tracto 14121');
});

test('prefiere el económico guardado en la falla y conserva etiqueta sin número', () => {
  assert.equal(e.etiquetaComponente('1ra TOLVA', payload, '14099', 'tolva1'), 'Tolva 14099 (1ra)');
  assert.equal(e.etiquetaComponente('1ra TOLVA', {}), '1ra TOLVA');
  assert.equal(e.etiquetaComponente('1ra TOLVA', { tolva1: 'S/N' }), '1ra TOLVA');
});

test('encabezado y descripción de OT existente', () => {
  assert.equal(e.encabezadoComponentes(payload), 'Tracto 14121 / Tolva 14091 (1ra) / Dolly 14147 / Tolva 14110 (2da)');
  assert.equal(
    e.descripcionConEconomicos('1ra TOLVA | FRENOS: Rotochambers ; 2da TOLVA | FRENOS: Levas', payload),
    'Tolva 14091 (1ra) | FRENOS: Rotochambers ; Tolva 14110 (2da) | FRENOS: Levas'
  );
});
