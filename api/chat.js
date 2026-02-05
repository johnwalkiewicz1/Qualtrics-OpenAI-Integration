import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function corsHeaders(origin) {
  // If you want to lock this down, replace "*" with "https://YOUR_QUALTRICS_DOMAIN"
  // Example: https://yourschool.qualtrics.com
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.status(204).setHeader("Content-Type", "text/plain");
    for (const [k, v] of Object.entries(corsHeaders(req.headers.origin))) res.setHeader(k, v);
    return res.end();
  }

  for (const [k, v] of Object.entries(corsHeaders(req.headers.origin))) res.setHeader(k, v);
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const {
      prompt = "",
      system = "",
      history = [],
      model = "gpt-5-nano",
      temperature,
      max_tokens
    } = body;

    // Build messages the way the Chat Completions API expects
    const messages = [];
    if (system && String(system).trim()) messages.push({ role: "system", content: String(system) });

    if (Array.isArray(history)) {
      for (const m of history) {
        if (!m || !m.role || typeof m.content !== "string") continue;
        // Only allow the roles you expect from Qualtrics
        if (!["user", "assistant", "system"].includes(m.role)) continue;
        messages.push({ role: m.role, content: m.content });
      }
    }

    // Ensure the latest prompt is included (Qualtrics sends both `history` and `prompt`)
    if (String(prompt).trim()) messages.push({ role: "user", content: String(prompt) });

    const completion = await client.chat.completions.create({
      model,
      messages,
      ...(Number.isFinite(temperature) ? { temperature } : {}),
      ...(Number.isFinite(max_tokens) ? { max_tokens } : {})
    });

    const text = completion?.choices?.[0]?.message?.content ?? "";
    return res.status(200).json({ text });
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: "Proxy failed" });
  }
}
