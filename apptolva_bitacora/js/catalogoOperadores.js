/**
 * js/catalogoOperadores.js
 * Catálogo Maestro Oficial de Operadores de Transporte - Grupo Bachoco
 * Plantilla Flota Propia (65 Operadores)
 */
const CATALOGO_OPERADORES = {
  "2843":   { nombre: "SALOME SANTOS SANTIAGO", depto: "TRANSPORTES" },
  "148307": { nombre: "MORALES IXTEPAN GERMAN", depto: "TRANSPORTES" },
  "221416": { nombre: "SALAS DOMINGUEZ JOSE CARLOS", depto: "TRANSPORTES" },
  "221417": { nombre: "AMBROSIO SOLIS FRANCISCO ALBERTO", depto: "TRANSPORTES" },
  "7768":   { nombre: "PEREZ LINARES JOSE MANUEL", depto: "TRANSPORTES" },
  "221948": { nombre: "MORALES REYES OMAR IGNACIO", depto: "TRANSPORTES" },
  "227210": { nombre: "RODRIGUEZ MARTINEZ WILMER", depto: "TRANSPORTES" },
  "228196": { nombre: "CABAÑAS ELVIRA REYES", depto: "TRANSPORTES" },
  "228484": { nombre: "HERNANDEZ RIQUET RAUL", depto: "TRANSPORTES" },
  "230545": { nombre: "GARCIA SOLANO MARTIN", depto: "TRANSPORTES" },
  "231134": { nombre: "CRUZ RAMIREZ CHRISTIAN", depto: "TRANSPORTES" },
  "231782": { nombre: "VALENZUELA ALEJANDRO VICTOR", depto: "TRANSPORTES" },
  "234363": { nombre: "CRUZ HERNANDEZ EUGENIO", depto: "TRANSPORTES" },
  "160630": { nombre: "REYES LUIS CARLOS OMAR", depto: "TRANSPORTES" },
  "235144": { nombre: "PEREZ SARABIA VICTOR JESUS", depto: "TRANSPORTES" },
  "236019": { nombre: "FAJARDO RUEDA ISMAEL", depto: "TRANSPORTES" },
  "236486": { nombre: "SOSA ITURIEL NATAEL", depto: "TRANSPORTES" },
  "237367": { nombre: "GARCIA HERNANDEZ ERASMO", depto: "TRANSPORTES" },
  "135471": { nombre: "LUIS SANTIAGO EMMANUEL", depto: "TRANSPORTES" },
  "242300": { nombre: "RAMIREZ BORJAS SANTIAGO", depto: "TRANSPORTES" },
  "236179": { nombre: "VASQUEZ MONTIEL ZABDI ANNEME", depto: "TRANSPORTES" },
  "248980": { nombre: "CARRION DOMINGUEZ MARIA FERNANDA", depto: "TRANSPORTES" },
  "257715": { nombre: "LAGUNES BARRADAS JORGE", depto: "TRANSPORTES" },
  "262185": { nombre: "JUNCO GONZALEZ KENI DANIEL", depto: "TRANSPORTES" },
  "262354": { nombre: "GUTIERREZ REYES RODRIGO", depto: "TRANSPORTES" },
  "267839": { nombre: "DE JESUS GUILLEN JORGE", depto: "TRANSPORTES" },
  "268953": { nombre: "JIMENEZ FUENTES ERNESTO", depto: "TRANSPORTES" },
  "270899": { nombre: "CHAVARRIA CHARQUEÑO JOSE GUADALUPE", depto: "TRANSPORTES" },
  "271639": { nombre: "FIGUEROA HERNANDEZ GERONIMO", depto: "TRANSPORTES" },
  "272019": { nombre: "MORALES SOTO JOSE LUIS", depto: "TRANSPORTES" },
  "272022": { nombre: "HERNANDEZ TORRES HIPOLITO", depto: "TRANSPORTES" },
  "272082": { nombre: "HERNANDEZ OSORIO RUBEN", depto: "TRANSPORTES" },
  "274730": { nombre: "TOLEDO SANTIAGO ALEJANDRO", depto: "TRANSPORTES" },
  "202278": { nombre: "MIRANDA MARTINEZ CARLOS IVAN", depto: "TRANSPORTES" },
  "275225": { nombre: "CHAGALA REYES VICTOR", depto: "TRANSPORTES" },
  "276851": { nombre: "FLORES LARA IVAN", depto: "TRANSPORTES" },
  "277258": { nombre: "HERNANDEZ CERDA RAFAEL", depto: "TRANSPORTES" },
  "277737": { nombre: "TOLEDO LOPEZ OMAR", depto: "TRANSPORTES" },
  "278143": { nombre: "GOMEZ ENRIQUEZ JOSE ALBERTO", depto: "TRANSPORTES" },
  "278272": { nombre: "SANCHEZ RODRIGUEZ URIEL ARMANDO", depto: "TRANSPORTES" },
  "279838": { nombre: "ALVARADO AQUINO LUIS ANTONIO", depto: "TRANSPORTES" },
  "284593": { nombre: "CASTAÑEDA ALVARADO ROGELIO", depto: "TRANSPORTES" },
  "103649": { nombre: "PERALTA CASTILLO ERNESTO", depto: "TRANSPORTES" },
  "285527": { nombre: "MORTERA MARTINEZ ROBERTO", depto: "TRANSPORTES" },
  "285881": { nombre: "LOPEZ RAMIREZ JESUS MAURICIO", depto: "TRANSPORTES" },
  "287235": { nombre: "HERNANDEZ SESMA GUSTAVO ANTONIO", depto: "TRANSPORTES" },
  "288070": { nombre: "TENA GREGORIO", depto: "TRANSPORTES" },
  "288150": { nombre: "DE DIOS LAZARO CARLOS DAVID", depto: "TRANSPORTES" },
  "288560": { nombre: "PEREZ LOPEZ ANDRES", depto: "TRANSPORTES" },
  "288571": { nombre: "ESPINOZA MARTINEZ CRISTIAN SAMUEL", depto: "TRANSPORTES" },
  "289649": { nombre: "JIMENEZ MORTERA GREGORIO", depto: "TRANSPORTES" },
  "290161": { nombre: "JIMENEZ JIMENEZ GEOVANNY JARETH", depto: "TRANSPORTES" },
  "234380": { nombre: "NEGRETE LUNA PABLO", depto: "TRANSPORTES" },
  "291438": { nombre: "PARRA BAEZ HUMBERTO", depto: "TRANSPORTES" },
  "291706": { nombre: "BARRAZA BRITO ASLAN", depto: "TRANSPORTES" },
  "292067": { nombre: "ACEVEDO RIVERA JAZMIN BERENICE", depto: "TRANSPORTES" },
  "293663": { nombre: "ROMERO RAMIREZ ANTONIO", depto: "TRANSPORTES" },
  "295403": { nombre: "SANTIAGO CORTES JOSE MANUEL", depto: "TRANSPORTES" },
  "296246": { nombre: "PERALTA MARTINEZ JOSE LUIS", depto: "TRANSPORTES" },
  "297136": { nombre: "GOOPAR IVAN ANTONIO", depto: "TRANSPORTES" },
  "297281": { nombre: "LOPEZ JIMENEZ MARTIN", depto: "TRANSPORTES" },
  "297285": { nombre: "DOMINGUEZ MORA LAZARO", depto: "TRANSPORTES" },
  "297933": { nombre: "CHONTAL CORTEZ JOSE OSMIN", depto: "TRANSPORTES" },
  "233846": { nombre: "PEREZ PEREZ IVAN DE JESUS", depto: "TRANSPORTES" },
  "208525": { nombre: "CRUZ PEREZ BERNARDINO", depto: "TRANSPORTES" }
};

// Funciones de ayuda
function buscarOperadorPorNumero(num) {
  const limpio = String(num || "").trim();
  return CATALOGO_OPERADORES[limpio] || null;
}

function buscarOperadoresPorTexto(query) {
  const q = String(query || "").toUpperCase().trim();
  if (!q) return [];
  const resultados = [];
  for (const [numero, data] of Object.entries(CATALOGO_OPERADORES)) {
    if (numero.includes(q) || data.nombre.includes(q)) {
      resultados.push({ numero, nombre: data.nombre });
    }
  }
  return resultados;
}

if (typeof window !== "undefined") {
  window.CATALOGO_OPERADORES = CATALOGO_OPERADORES;
  window.buscarOperadorPorNumero = buscarOperadorPorNumero;
  window.buscarOperadoresPorTexto = buscarOperadoresPorTexto;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CATALOGO_OPERADORES, buscarOperadorPorNumero, buscarOperadoresPorTexto };
}