(function () {
  const CATALOGO_MAESTRO_BACHOCO = {
    TRACTO: [
      {
        categoria: 'MOTOR',
        itemOficial: 'Fugas / Bandas / Poleas / Mangueras / Turbocargador',
        terminosTaller: ['motor', 'banda', 'polea', 'fuga de aceite', 'fuga de agua', 'anticongelante', 'turbo', 'manguera rota', 'filtro', 'tira aceite', 'bomba de agua']
      },
      {
        categoria: 'SUSPENSIÓN',
        itemOficial: 'Bolsas de aire / Muelles / Amortiguadores / Birlos / Tacones',
        terminosTaller: ['tacones de cabina', 'tacones', 'bolsa ponchada', 'bolsa de aire', 'muelle', 'hoja rota', 'amortiguador', 'birlo degollado', 'tuerca floja', 'birlos']
      },
      {
        categoria: 'ELÉCTRICO',
        itemOficial: 'Luces / Baterías / Conectores / Sin Espías (Testigos) / A/C',
        terminosTaller: ['no prende luz', 'faro', 'cuarto', 'plafon', 'bateria', 'marcha', 'alternador', 'espia', 'testigo', 'check engine', 'ac dega de tirar aire', 'siroco', 'clima', 'a/c', 'compresor de clima']
      },
      {
        categoria: 'CARROCERÍA',
        itemOficial: 'Parabrisas/Cristales / Retrovisores / Chasis / Plumillas (tricos) / Yugo',
        terminosTaller: ['parabrisas', 'parabrisas estrellado', 'parabrisas fisurado', 'cristal', 'ventana', 'manija puerta no abre', 'puerta no abre', 'tricos', 'plumillas', 'limpiaparabrisas', 'espejo roto', 'defensa', 'golpe en cofre', 'cofre']
      },
      {
        categoria: 'INTERIOR',
        itemOficial: 'Asientos / Tablero / Limpieza',
        terminosTaller: ['asiento', 'asiento roto', 'base del asiento', 'cinturon', 'tablero', 'reloj de presion', 'medidor']
      },
      {
        categoria: 'FRENOS',
        itemOficial: 'Balatas / Rotochamber / Matracas / Sin fuga de aire / Compresor',
        terminosTaller: ['balata', 'freno', 'rotochamber', 'chambers', 'matraca', 'fuga de aire', 'fuga por siroco', 'valvula repartidora', 'compresor', 'manguera de frenos']
      }
    ],
    TOLVAS: [
      {
        categoria: 'ESTRUCTURA Y SISTEMA DE DESCARGA',
        itemOficial: 'Pluma / Tapas / Tolva / Manivelas / Gusano / Chumacera',
        terminosTaller: ['bazuca', 'gusano', 'gusano de la bazuca', 'sinfin', 'motor vertical', 'chumacera', 'balero', 'balero de bazuca', 'manivela', 'patines', 'patin', 'tapa floja', 'tapas', 'seguro de tapa', 'linea de vida', 'escalera', 'pasamanos', 'golpe en cuerpo', 'cuerpo de tolva', 'fuga de grano', 'compuerta']
      },
      {
        categoria: 'SISTEMA HIDRÁULICO',
        itemOficial: 'Nivel de aceite / Fugas / Mangueras / Banco de válvulas / Manómetros',
        terminosTaller: ['banco de valvulas', 'manguera hidraulica', 'fuga de hidraulico', 'piston', 'gato', 'palanca de descarga', 'valvula hidraulica', 'manometro', 'toma de fuerza']
      },
      {
        categoria: 'SUSPENSIÓN',
        itemOficial: 'Bolsa de aire / Válvulas de suspensión / Amortiguadores',
        terminosTaller: ['bolsa de suspension', 'valvula niveladora', 'amortiguador de remolque', 'buje de tirante', 'balancin', 'cambiar llantas', 'llanta ponchada', 'llanta lisa']
      },
      {
        categoria: 'FRENOS',
        itemOficial: 'Balatas / Rotochambers / Matracas / Levas / Mangueras',
        terminosTaller: ['leva', 'balata cristalizada', 'resorte de freno', 'camara de freno', 'rotochamber de tolva', 'manguera roja', 'manguera azul']
      },
      {
        categoria: 'ELÉCTRICO',
        itemOficial: 'Luces / Enchufes 7 vías / Conectores / Cables',
        terminosTaller: ['enchufe 7 vias', 'cable espiral', 'plafonera', 'foco fundido', 'luz lateral', 'sin luces traseras']
      }
    ],
    DOLLY: [
      {
        categoria: 'ACCESORIOS Y ENGANCHE',
        itemOficial: 'Lanza / Bujes / Matraca Dolly / Cadenas / Engrasado / Ganchos',
        terminosTaller: ['lanza', 'bujes de lanza', 'bujes', 'apretar o cambiar bujes', 'checar bujes', 'gancho de cadena', 'cadenas', 'seguro de ganchos', 'matraca dolly', 'quinta de dolly', 'plato de dolly', 'mordaza', 'engrasado', 'ojo de lanza']
      },
      {
        categoria: 'SUSPENSIÓN',
        itemOficial: 'Cámara de Suspensión / Amortiguadores / Birlos / Llantas',
        terminosTaller: ['camara de suspension', 'llantas', 'llanta desgastada', 'birlo flojo', 'tuerca de dolly', 'amortiguadores de dolly']
      },
      {
        categoria: 'FRENOS',
        itemOficial: 'Matracas autoajuste / Chambers / Balatas / Fugas',
        terminosTaller: ['matraca autoajuste', 'matracas', 'chambers', 'fuga en mangueras de aire', 'valvula relay']
      },
      {
        categoria: 'ELÉCTRICO',
        itemOficial: 'Luces / Conectores / Estado de los cables',
        terminosTaller: ['arres de dolly', 'plafon de dolly', 'sin luz en calavera']
      }
    ]
  };

  const TEXTOS_DESCARTABLES = [
    'ok', 'bien', 'sin observaciones', 'sin novedad', 'ninguna', 'n/a', 'limpio', 'normal', 'todo bien', 'correcto', 's/n', 'nada'
  ];

  if (typeof window !== 'undefined') {
    window.CATALOGO_MAESTRO_BACHOCO = CATALOGO_MAESTRO_BACHOCO;
    window.TEXTOS_DESCARTABLES = TEXTOS_DESCARTABLES;
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.CATALOGO_MAESTRO_BACHOCO = CATALOGO_MAESTRO_BACHOCO;
    globalThis.TEXTOS_DESCARTABLES = TEXTOS_DESCARTABLES;
  }
})();
