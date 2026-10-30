import { writeFile } from "node:fs/promises";

const outputPath = process.argv[2] || new URL("./firebase-config.js", import.meta.url);
const configVariables = {
  staging: "FIREBASE_STAGING_CONFIG_JSON",
  production: "FIREBASE_PRODUCTION_CONFIG_JSON"
};
const configs = {};

for (const [environment, variable] of Object.entries(configVariables)) {
  let config;
  try {
    config = JSON.parse(process.env[variable]);
  } catch {
    throw new Error(`${variable} debe contener un objeto JSON válido.`);
  }

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`${variable} debe ser un objeto JSON.`);
  }
  for (const key of ["apiKey", "authDomain", "projectId", "messagingSenderId", "appId"]) {
    if (typeof config[key] !== "string" || !config[key].trim()) {
      throw new Error(`${variable} debe incluir "${key}" como texto no vacío.`);
    }
  }
  for (const key of ["measurementId", "storageBucket"]) {
    if (config[key] !== undefined && typeof config[key] !== "string") {
      throw new Error(`${variable}.${key} debe ser texto si se especifica.`);
    }
  }
  configs[environment] = config;
}

if (configs.staging.projectId === configs.production.projectId) {
  throw new Error("Staging y producción deben usar projectId distintos.");
}

const serialized = JSON.stringify(configs).replaceAll("<", "\\u003c");
const buildContext = JSON.stringify(String(process.env.CONTEXT || "").toLowerCase());
await writeFile(
  outputPath,
  `globalThis.__APPTOLVA_FIREBASE_CONFIGS__ = Object.freeze(${serialized});\nglobalThis.__APPTOLVA_BUILD_CONTEXT__ = ${buildContext};\n`,
  { encoding: "utf8" }
);
