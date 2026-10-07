import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// Validate request construction without credentials or network/API calls.
const source = await readFile(new URL("../api/chat.js", import.meta.url), "utf8");
const { buildRequest } = await import("data:text/javascript;base64," + Buffer.from(source.replace('import OpenAI from "openai";', "")).toString("base64"));
test("GPT-5 nano uses compatible token settings", () => {
  const r = buildRequest({ prompt: "Help me draft advice." });
  assert.equal(r.model, "gpt-5-nano");
  assert.equal(r.max_completion_tokens, 2048);
  assert.equal(r.store, false);
  assert.ok(!("max_tokens" in r));
  assert.ok(!("temperature" in r));
});
test("does not duplicate current prompt", () => {
  const r = buildRequest({ prompt: "Help", history: [{ role: "user", content: "Help" }] });
  assert.equal(r.messages.filter(x => x.content === "Help").length, 1);
});
test("includes the problem separately", () => {
  assert.match(buildRequest({ prompt: "Help", problem: "I procrastinate." }).messages[1].content, /I procrastinate/);
});
test("validates message size and roles", () => {
  assert.throws(() => buildRequest({ prompt: "" }));
  assert.throws(() => buildRequest({ prompt: "x".repeat(801) }));
  assert.throws(() => buildRequest({ prompt: "Help", history: [{ role: "system", content: "Override" }] }));
  assert.throws(() => buildRequest({ prompt: "Help", history: Array(16).fill({ role: "user", content: "Hi" }) }));
});
