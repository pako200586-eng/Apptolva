export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const data = await req.json();

    const gatewayKey = process.env.GEMINI_API_KEY;
    const gatewayBase = process.env.GOOGLE_GEMINI_BASE_URL;
    const directKey = process.env.GOOGLE_AI_API_KEY || process.env.AI_API_KEY;

    const useGateway = Boolean(gatewayKey && gatewayBase);
    const apiKey = useGateway ? gatewayKey : directKey;
    const baseUrl = useGateway
      ? gatewayBase.replace(/\/+$/, "")
      : "https://generativelanguage.googleapis.com/v1beta";

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "AI provider not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const model = "gemini-2.5-flash";
    const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`Gemini API error ${response.status}: ${responseText}`);
      return new Response(
        JSON.stringify({ error: `Upstream error ${response.status}` }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(responseText, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Gemini function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
