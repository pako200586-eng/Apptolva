import { createPublicKey, verify as verifySignature } from "node:crypto";

// Verificación del token de Firebase Authentication (cuenta de supervisor) compartida
// por las funciones del panel administrativo.
const FIREBASE_CERTIFICATES_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const TOKEN_CLOCK_TOLERANCE_SECONDS = 300;

let cachedCertificates = null;
let certificatesExpireAt = 0;

class InvalidFirebaseTokenError extends Error {}

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function getEnvironmentVariable(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || "";
}

function getAllowedAdminEmails() {
  return getEnvironmentVariable("ADMIN_EMAILS")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

// Sin ADMIN_EMAILS configurada se conserva el comportamiento anterior (cualquier cuenta
// de correo/contrasena verificada), para que una variable faltante no deje el panel sin acceso.
function isAllowedAdminEmail(email) {
  const allowedEmails = getAllowedAdminEmails();
  if (!allowedEmails.length) return true;
  return allowedEmails.includes(String(email).trim().toLowerCase());
}

function getFirebaseProjectId() {
  const configuredProjectId = getEnvironmentVariable("FIREBASE_PROJECT_ID");
  if (configuredProjectId) return configuredProjectId;

  const serviceAccountJson = getEnvironmentVariable("FIREBASE_SERVICE_ACCOUNT");

  if (serviceAccountJson) {
    try {
      const projectId = JSON.parse(serviceAccountJson)?.project_id;
      if (projectId) return projectId;
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT must contain valid service account JSON");
    }
  }

  throw new Error("FIREBASE_PROJECT_ID is not configured");
}

function decodeBase64UrlJson(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new InvalidFirebaseTokenError("Malformed Firebase ID token");
  }
}

function certificateCacheDuration(headers) {
  const cacheControl = headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 0);
  return Math.max(60, maxAge || 3600) * 1000;
}

async function getFirebaseCertificates(forceRefresh = false) {
  if (!forceRefresh && cachedCertificates && Date.now() < certificatesExpireAt) {
    return cachedCertificates;
  }

  const response = await fetch(FIREBASE_CERTIFICATES_URL);
  if (!response.ok) {
    throw new Error(`Firebase certificate service returned ${response.status}`);
  }

  const certificates = await response.json();
  if (!certificates || typeof certificates !== "object") {
    throw new Error("Firebase certificate service returned invalid data");
  }

  cachedCertificates = certificates;
  certificatesExpireAt = Date.now() + certificateCacheDuration(response.headers);
  return certificates;
}

function validateFirebaseClaims(payload, projectId) {
  const now = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const audienceMatches = payload.aud === projectId
    || (Array.isArray(payload.aud) && payload.aud.includes(projectId));

  if (!audienceMatches || payload.iss !== expectedIssuer) {
    throw new InvalidFirebaseTokenError("Firebase token project does not match");
  }
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) {
    throw new InvalidFirebaseTokenError("Firebase token subject is invalid");
  }
  if (typeof payload.exp !== "number" || payload.exp <= now) {
    throw new InvalidFirebaseTokenError("Firebase token has expired");
  }
  if (
    typeof payload.iat !== "number"
    || payload.iat > now + TOKEN_CLOCK_TOLERANCE_SECONDS
  ) {
    throw new InvalidFirebaseTokenError("Firebase token issue time is invalid");
  }
  if (
    payload.auth_time !== undefined
    && (typeof payload.auth_time !== "number"
      || payload.auth_time > now + TOKEN_CLOCK_TOLERANCE_SECONDS)
  ) {
    throw new InvalidFirebaseTokenError("Firebase token authentication time is invalid");
  }
}

async function verifyFirebaseIdToken(idToken) {
  const parts = idToken.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new InvalidFirebaseTokenError("Malformed Firebase ID token");
  }

  const header = decodeBase64UrlJson(parts[0]);
  const payload = decodeBase64UrlJson(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new InvalidFirebaseTokenError("Firebase token header is invalid");
  }

  let certificates = await getFirebaseCertificates();
  let certificate = certificates[header.kid];
  if (!certificate) {
    certificates = await getFirebaseCertificates(true);
    certificate = certificates[header.kid];
  }
  if (!certificate) {
    throw new InvalidFirebaseTokenError("Firebase token signing key is unknown");
  }

  const validSignature = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey(certificate),
    Buffer.from(parts[2], "base64url"),
  );
  if (!validSignature) {
    throw new InvalidFirebaseTokenError("Firebase token signature is invalid");
  }

  validateFirebaseClaims(payload, getFirebaseProjectId());
  return payload;
}

async function hasAdminAccess(req) {
  const authHeader = req.headers.get("authorization") || "";
  const idToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";

  if (!idToken) return false;

  try {
    const decodedToken = await verifyFirebaseIdToken(idToken);
    return Boolean(
      decodedToken.email
      && decodedToken.firebase?.sign_in_provider === "password"
      && decodedToken.admin === true
      && isAllowedAdminEmail(decodedToken.email),
    );
  } catch (error) {
    if (error instanceof InvalidFirebaseTokenError) return false;
    throw error;
  }
}

export async function authorizeRequest(req, corsHeaders) {
  try {
    if (await hasAdminAccess(req)) return null;
    return jsonResponse(401, { error: "Unauthorized" }, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Firebase authentication is unavailable:", message);
    return jsonResponse(500, { error: message }, corsHeaders);
  }
}
