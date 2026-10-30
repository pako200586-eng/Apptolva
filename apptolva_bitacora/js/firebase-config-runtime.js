(function (global) {
  global.getAppFirebaseConfig = function (hostname = global.location?.hostname || "") {
    const host = String(hostname).toLowerCase();
    const contextoBuild = String(global.__APPTOLVA_BUILD_CONTEXT__ || "").toLowerCase();
    const esStaging = host === "localhost"
      || host === "127.0.0.1"
      || host === "::1"
      || host === "[::1]"
      || host.startsWith("deploy-preview-")
      || host.includes("staging")
      || (contextoBuild !== "" && contextoBuild !== "production");
    const environment = esStaging ? "staging" : "production";
    const config = global.__APPTOLVA_FIREBASE_CONFIGS__?.[environment];
    if (!config) {
      throw new Error(`Falta la configuración de Firebase para ${environment}.`);
    }
    return config;
  };
})(globalThis);
