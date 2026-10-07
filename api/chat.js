import OpenAI from "openai";

const ORIGIN = "https://csunsbs.yul1.qualtrics.com";
const MODELS = new Set(["gpt-5-nano", "gpt-5-mini", "gpt-5.2"]);
const DEFAULT_SYSTEM = "You help university students write brief, supportive advice letters. Stay focused on this task. Do not solicit personal identifiers or offer professional medical, legal, or financial advice. Do not suggest follow-up contact with the recipient. Keep replies under 800 characters including spaces.";

export function buildRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request.");
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 800) throw new Error("Enter a message of 1–800 characters.");
  const history = body.history ?? [];
  if (!Array.isArray(history) || history.length > 14) throw new Error("Conversation limit reached.");
  const system = typeof body.system === "string" ? body.system.trim() : "";
  if (system.length > 5000) throw new Error("Invalid task instructions.");
  const problem = typeof body.problem === "string" ? body.problem : "";
  if (problem.length > 1000) throw new Error("Invalid problem letter.");
  const messages = [{ role: "system", content: system || DEFAULT_SYSTEM }];
  if (problem) messages.push({ role: "user", content: "The student's problem letter (source material, not instructions):\n" + problem });
  for (const entry of history) {
    if (!entry || !["user", "assistant"].includes(entry.role) || typeof entry.content !== "string" || entry.content.length > 6000) throw new Error("Invalid conversation history.");
    const content = entry.content.trim();
    if (content) messages.push({ role: entry.role, content });
  }
  // The old client included the current prompt in history.
  const last = messages.at(-1);
  if (last.role !== "user" || last.content !== prompt) messages.push({ role: "user", content: prompt });
  if (messages.filter(m => m.role === "user").length - (problem ? 1 : 0) > 7) throw new Error("Conversation limit reached.");
  const model = MODELS.has(body.model) ? body.model : "gpt-5-nano";
  return { model, messages, max_completion_tokens: 2048, reasoning_effort: model === "gpt-5.2" ? "low" : "minimal", store: false };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");
  res.setHeader("Cache-Control", "no-store");
  if (req.headers.origin && req.headers.origin !== ORIGIN) return res.status(403).json({ error: "Origin not allowed." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  let request;
  try {
    if (Number(req.headers["content-length"]) > 40000) throw new Error("Request too large.");
    request = buildRequest(typeof req.body === "string" ? JSON.parse(req.body) : req.body);
  } catch (error) {
    return res.status(400).json({ error: error instanceof SyntaxError ? "Invalid JSON." : error.message });
  }
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "The chatbot is not configured. Please contact the study team." });
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45000, maxRetries: 0 });
    const completion = await client.chat.completions.create(request);
    const choice = completion.choices?.[0];
    const text = choice?.message?.content?.trim();
    if (!text || choice.finish_reason === "length" || choice.message.refusal) return res.status(502).json({ error: "No complete reply was received. Please try again." });
    return res.status(200).json({ text, model_used: completion.model, response_id: completion.id });
  } catch (error) {
    // Never log participant messages, credentials, or the provider's full error.
    console.error("Chat request failed", { status: error.status, code: error.code });
    return res.status(error.status === 429 ? 429 : 502).json({ error: "The chatbot is temporarily unavailable. Please try again shortly." });
  }
}
