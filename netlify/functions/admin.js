import { readFile } from "node:fs/promises";
import { join } from "node:path";

const REALM = "AppTolva Supervisores";

function parseBasicAuth(authHeader) {
  if (!authHeader?.startsWith("Basic ")) return null;

  try {
    const decoded = atob(authHeader.slice(6));
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return null;

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function unauthorizedResponse() {
  return new Response("Acceso restringido a supervisores.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}"`,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function hasValidSupervisorCredentials(req) {
  const username = process.env.ADMIN_SUPERVISOR_USER;
  const password = process.env.ADMIN_SUPERVISOR_PASSWORD;
  const credentials = parseBasicAuth(req.headers.get("authorization"));

  return Boolean(
    username &&
      password &&
      credentials &&
      credentials.username === username &&
      credentials.password === password,
  );
}

export default async (req) => {
  if (!hasValidSupervisorCredentials(req)) {
    return unauthorizedResponse();
  }

  const html = await readFile(join(process.cwd(), "apptolva_bitacora", "admin.html"), "utf8");

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

export const config = {
  path: ["/admin", "/admin/"],
};
