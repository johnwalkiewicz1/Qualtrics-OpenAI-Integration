import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Safer to control allowed models on the server.
// Add/remove models here as needed.
const ALLOWED_MODELS = new Set([
  "gpt-5.4-nano",
  "gpt-5.4-mini",
  "gpt-5.4"
]);

const DEFAULT_MODEL = "gpt-5.4-nano";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": "https://csunsbs.yul1.qualtrics.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function pickModel(rawModel) {
  const cleaned = safeString(rawModel).trim();
  if (!cleaned) return DEFAULT_MODEL;
  if (ALLOWED_MODELS.has(cleaned)) return cleaned;
  return DEFAULT_MODEL;
}

function pickTemperature(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function pickMaxTokens(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.status(204).setHeader("Content-Type", "text/plain");
    for (const [k, v] of Object.entries(corsHeaders(req.headers.origin))) {
      res.setHeader(k, v);
    }
    return res.end();
  }

  for (const [k, v] of Object.entries(corsHeaders(req.headers.origin))) {
    res.setHeader(k, v);
  }
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body ?? {});

    const prompt = safeString(body.prompt).trim();
    const system = safeString(body.system).trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const requestedModel = safeString(body.model);
    const model = pickModel(requestedModel);
    const temperature = pickTemperature(body.temperature);
    const max_tokens = pickMaxTokens(body.max_tokens);

    console.log("Incoming model from Qualtrics:", JSON.stringify(requestedModel));
    console.log("Model sent to OpenAI:", JSON.stringify(model));

    const messages = [];

    if (system) {
      messages.push({
        role: "system",
        content: system
      });
    }

    for (const m of history) {
      if (!m) continue;
      if (!["user", "assistant", "system"].includes(m.role)) continue;
      if (typeof m.content !== "string") continue;

      const content = m.content.trim();
      if (!content) continue;

      messages.push({
        role: m.role,
        content
      });
    }

    if (prompt) {
      messages.push({
        role: "user",
        content: prompt
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        error: "No valid messages were provided"
      });
    }

    const requestPayload = {
      model,
      messages
    };

    // Only include optional params when valid.
    if (temperature !== undefined) {
      requestPayload.temperature = temperature;
    }
    if (max_tokens !== undefined) {
      requestPayload.max_tokens = max_tokens;
    }

    const completion = await client.chat.completions.create(requestPayload);

    const text = completion?.choices?.[0]?.message?.content ?? "";

    return res.status(200).json({
      text,
      model_used: model
    });
  } catch (err) {
    console.error("Proxy error:", err);

    const status = Number.isInteger(err?.status) ? err.status : 500;
    const message =
      err?.error?.message ||
      err?.message ||
      "Proxy failed";

    return res.status(status).json({
      error: message
    });
  }
}
//Deploy check
