import { getStore } from "@netlify/blobs";

function generateId() {
  return crypto.randomUUID().replace(/-/g, '');
}

export default async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const store = getStore({ name: "bitacoras", consistency: "strong" });

  if (req.method === "POST") {
    try {
      const data = await req.json();
      const id = generateId();
      // Store for 24 hours (TTL in seconds)
      await store.setJSON(id, data, { ttl: 86400 });

      const origin = new URL(req.url).origin;
      const viewerUrl = `${origin}/viewer.html?id=${id}`;

      return new Response(JSON.stringify({ id, url: viewerUrl }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Missing id" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    try {
      const data = await store.get(id, { type: "json" });

      if (!data) {
        return new Response(JSON.stringify({ error: "Not found or expired" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
};

export const config = {
  path: "/api/store-bitacora",
};
