import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../apptolva_bitacora/index.html', import.meta.url), 'utf8');
const start = html.indexOf('        // --- ASISTENTE IA ---');
const end = html.indexOf('    </script>', start);
assert.ok(start !== -1 && end !== -1, 'No se encontró el bloque del asistente');
const source = html.slice(start, end);

function assistant(initialVoices = []) {
  let voices = initialVoices;
  const listeners = {};
  const controls = { hidden: true };
  controls.classList = { toggle: (_name, hidden) => { controls.hidden = hidden; } };
  const pauseButton = { setAttribute(_name, value) { this.label = value; }, innerHTML: '' };
  const synthesis = {
    paused: false,
    getVoices: () => voices,
    addEventListener: (event, listener) => { listeners[event] = listener; },
    cancel() { this.cancelled = true; },
    pause() { this.paused = true; },
    resume() { this.paused = false; },
    speak(utterance) { this.lastUtterance = utterance; }
  };
  class Utterance {
    constructor(text) { this.text = text; }
  }
  const context = vm.createContext({
    window: { speechSynthesis: synthesis },
    SpeechSynthesisUtterance: Utterance,
    document: {
      getElementById: id => ({ voiceControls: controls, btnSpeechPause: pauseButton })[id]
    }
  });
  vm.runInContext(source, context);
  return {
    context,
    synthesis,
    controls,
    pauseButton,
    setVoices(nextVoices, notify = true) {
      voices = nextVoices;
      if (notify) listeners.voiceschanged();
    }
  };
}

test('prioriza una voz mexicana identificada como Google, Natural o Neural', () => {
  const generic = { lang: 'es-MX', name: 'Español' };
  const preferred = { lang: 'es_mx', name: 'google español' };
  const { context, synthesis } = assistant([generic, preferred]);
  context.speak('Respuesta');
  assert.equal(synthesis.lastUtterance.voice, preferred);
  assert.equal(synthesis.lastUtterance.lang, 'es-MX');
  assert.equal(synthesis.lastUtterance.rate, 1.05);
  assert.equal(synthesis.lastUtterance.pitch, 1);
});

test('usa voz mexicana, española o primera disponible como respaldo', () => {
  const english = { lang: 'en-US', name: 'English' };
  const spanish = { lang: 'es-ES', name: 'Español' };
  const mexican = { lang: 'es_MX', name: 'Mexicana' };
  const { context, setVoices } = assistant([english, spanish, mexican]);
  assert.equal(context.obtenerMejorVoz(), mexican);
  setVoices([english, spanish]);
  assert.equal(context.obtenerMejorVoz(), spanish);
  setVoices([english]);
  assert.equal(context.obtenerMejorVoz(), english);
});

test('admite una lista inicialmente vacía y actualiza voces posteriores', () => {
  const { context, synthesis, setVoices } = assistant();
  context.speak('Primera respuesta');
  assert.equal(synthesis.lastUtterance.voice, undefined);
  const mexican = { lang: 'es-MX', name: 'Mexicana' };
  setVoices([mexican]);
  context.speak('Segunda respuesta');
  assert.equal(synthesis.lastUtterance.voice, mexican);

  const preferred = { lang: 'es-MX', name: 'Natural' };
  setVoices([preferred], false);
  context.speak('Tercera respuesta');
  assert.equal(synthesis.lastUtterance.voice, preferred);
});

test('mantiene los controles de pausa, reanudación y detención', () => {
  const { context, synthesis, controls, pauseButton } = assistant([{ lang: 'es-MX', name: 'Mexicana' }]);
  context.speak('Respuesta');
  assert.equal(controls.hidden, false);
  context.toggleSpeechPause();
  assert.equal(synthesis.paused, true);
  assert.equal(pauseButton.label, 'Reanudar voz');
  context.toggleSpeechPause();
  assert.equal(synthesis.paused, false);
  context.stopSpeech();
  assert.equal(synthesis.cancelled, true);
  assert.equal(controls.hidden, true);
});
