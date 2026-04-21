/**
 * llmService.js — Dual LLM Service
 *
 * Provider priority:
 *   1. OpenAI ChatGPT  (primary  — gpt-4o-mini, fast, reliable)
 *   2. Ollama          (fallback — qwen3:8b local, offline)
 *
 * Set LLM_PROVIDER in .env:
 *   LLM_PROVIDER=openai  → ChatGPT only
 *   LLM_PROVIDER=ollama  → Ollama only
 *   LLM_PROVIDER=auto    → ChatGPT first, Ollama fallback (default)
 *
 * Required env vars:
 *   OPENAI_API_KEY   → your OpenAI key
 *   OPENAI_MODEL     → default: gpt-4o-mini
 *   OLLAMA_URL       → default: http://localhost:11434
 *   OLLAMA_MODEL     → default: qwen3:8b
 */

const { OpenAI } = require("openai");
const axios      = require("axios");
const logger     = require("../utils/logger");

// ─── Config ───────────────────────────────────────────────────────────────────
const UNCERTAIN_MIN    = 0.35;
const UNCERTAIN_MAX    = 0.75;
const CACHE_TTL_MS   = 30 * 60 * 1000;  // 30 min cache
const OPENAI_TIMEOUT = 20000;            // 20s
const OLLAMA_TIMEOUT = 60000;            // 60s

// Provider config
const LLM_PROVIDER = process.env.LLM_PROVIDER || "auto";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OLLAMA_URL   = process.env.OLLAMA_URL   || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:8b";

// ─── State ───────────────────────────────────────────────────────────────────
let openaiClient   = null;
let ollamaWarmedUp = false;

const analysisCache = new Map();

// ─── OpenAI Init ─────────────────────────────────────────────────────────────
function getOpenAIClient() {
  if (openaiClient) return openaiClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-your") || apiKey === "") return null;
  openaiClient = new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT });
  logger.info(`OpenAI LLM initialized (${OPENAI_MODEL})`);
  return openaiClient;
}

// ─── OpenAI Call ──────────────────────────────────────────────────────────────
async function callOpenAI(prompt) {
  const client = getOpenAIClient();
  if (!client) throw new Error("OPENAI_NOT_CONFIGURED");

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content: "You are an expert fraud analyst at an Indian Public Sector Bank. Respond only in valid JSON.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.1,
    max_tokens: 500,
    response_format: { type: "json_object" },  // forces valid JSON output
  });

  return response.choices[0]?.message?.content || "";
}

// ─── Ollama Availability Check ────────────────────────────────────────────────
async function isOllamaRunning() {
  try {
    const res = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 2000 });
    const models = res.data?.models || [];
    return models.some(m => m.name?.startsWith(OLLAMA_MODEL.split(":")[0]));
  } catch {
    return false;
  }
}

// ─── Ollama Call ──────────────────────────────────────────────────────────────
async function callOllama(prompt) {
  const res = await axios.post(
    `${OLLAMA_URL}/api/generate`,
    {
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      keep_alive: "5m",
      options: { temperature: 0.1, num_predict: 500 },
    },
    { timeout: OLLAMA_TIMEOUT }
  );
  ollamaWarmedUp = true;
  return res.data?.response || "";
}

// ─── Ollama Warmup ────────────────────────────────────────────────────────────
async function warmupOllama() {
  if (LLM_PROVIDER === "openai" || LLM_PROVIDER === "gemini") return;
  const running = await isOllamaRunning();
  if (!running) {
    logger.info("Ollama not running — skipping warmup");
    return;
  }
  logger.info(`Warming up Ollama (${OLLAMA_MODEL})...`);
  try {
    const start = Date.now();
    await axios.post(
      `${OLLAMA_URL}/api/generate`,
      { model: OLLAMA_MODEL, prompt: "Reply OK", stream: false, keep_alive: "5m", options: { num_predict: 5 } },
      { timeout: OLLAMA_TIMEOUT }
    );
    ollamaWarmedUp = true;
    logger.info(`Ollama warmup done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  } catch (err) {
    logger.warn(`Ollama warmup failed: ${err.message}`);
  }
}

// ─── Smart Router — ChatGPT → Ollama ─────────────────────────────────────────
async function callLLM(prompt) {
  // Explicit single-provider modes
  if (LLM_PROVIDER === "openai") {
    const text = await callOpenAI(prompt);
    return { text, model: OPENAI_MODEL, provider: "openai" };
  }
  if (LLM_PROVIDER === "ollama") {
    const text = await callOllama(prompt);
    return { text, model: OLLAMA_MODEL, provider: "ollama" };
  }

  // "auto" — ChatGPT first, Ollama fallback
  // 1. Try OpenAI
  const client = getOpenAIClient();
  if (client) {
    try {
      logger.info(`[LLM] Using OpenAI (${OPENAI_MODEL})`);
      const text = await callOpenAI(prompt);
      return { text, model: OPENAI_MODEL, provider: "openai" };
    } catch (err) {
      logger.warn(`[LLM] OpenAI failed (${err.message}), trying Ollama...`);
    }
  }

  // 2. Try Ollama
  const ollamaUp = await isOllamaRunning();
  if (ollamaUp) {
    try {
      logger.info(`[LLM] Using Ollama (${OLLAMA_MODEL})`);
      const text = await callOllama(prompt);
      return { text, model: OLLAMA_MODEL, provider: "ollama" };
    } catch (err) {
      logger.warn(`[LLM] Ollama failed: ${err.message}`);
    }
  }

  throw new Error("NO_LLM_AVAILABLE");
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────
function buildPrompt(transaction, senderAccount, mlResult, riskProfile, effectiveScore) {
  const topReasons = (mlResult.reasons || [])
    .slice(0, 3)
    .map(r => `- ${r.description || r.feature}`)
    .join("\n");

  const layerSummary = riskProfile?.layers
    ? Object.entries(riskProfile.layers)
        .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
        .join(", ")
    : "unavailable";

  return `You are a fraud analyst at an Indian Public Sector Bank (PSB). Analyse this transaction and give a verdict.

TRANSACTION:
- ID: ${transaction.transactionId}
- Amount: ₹${Number(transaction.amount).toLocaleString("en-IN")}
- Type: ${transaction.type} via ${transaction.channel}
- Time: ${new Date(transaction.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
- Remarks: "${transaction.description || "(none)"}"

SENDER ACCOUNT:
- Bank: ${senderAccount.bankName}
- KYC Type: ${senderAccount.kycType || "FULL"}
- Account Risk Score: ${(senderAccount.riskScore || 0).toFixed(2)}
- Mule Score: ${(senderAccount.muleScore || 0).toFixed(2)}

FRAUD SIGNALS:
- ML Model Score: ${mlResult.fraudScore.toFixed(3)}
- 6-Layer Composite: ${riskProfile?.compositeScore?.toFixed(3) || "N/A"}
- Effective Score: ${effectiveScore.toFixed(3)} (needs LLM reasoning)
- Dominant Risk Layer: ${riskProfile?.dominantLayer || "ml"}
- Layer Breakdown: ${layerSummary}

TOP ML REASONS:
${topReasons || "- No specific reasons flagged"}

TASK: Provide your fraud verdict. Respond ONLY in this exact JSON format, no other text:
{
  "verdict": "SUSPICIOUS",
  "confidence": 0.72,
  "reasoning": "Your 2-3 sentence reasoning here.",
  "flags": ["flag1", "flag2", "flag3"]
}
Valid verdicts: SUSPICIOUS, MONITOR, CLEAR`;
}

// ─── Response Parser ──────────────────────────────────────────────────────────
function parseLLMResponse(text, modelName) {
  try {
    // Strip Qwen3 <think>...</think> tags if present (Ollama)
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      verdict:    ["SUSPICIOUS", "MONITOR", "CLEAR"].includes(parsed.verdict) ? parsed.verdict : "MONITOR",
      confidence: Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0.5)),
      reasoning:  parsed.reasoning || "LLM analysis inconclusive.",
      flags:      Array.isArray(parsed.flags) ? parsed.flags.slice(0, 3) : [],
      fromCache:  false,
      model:      modelName,
    };
  } catch {
    return {
      verdict:    "MONITOR",
      confidence:  0.5,
      reasoning:   text.slice(0, 300),
      flags:       [],
      fromCache:   false,
      model:       modelName,
    };
  }
}

// ─── Error Result Builder ─────────────────────────────────────────────────────
function errorResult(verdict, message, model = "unknown") {
  return { verdict, confidence: 0, reasoning: message, flags: [], fromCache: false, model };
}

// ─── Main Entry: analyseTransaction ──────────────────────────────────────────
async function analyseTransaction(transaction, senderAccount, mlResult, riskProfile) {
  const effectiveScore = riskProfile
    ? Math.max(mlResult.fraudScore, riskProfile.compositeScore)
    : mlResult.fraudScore;

  if (effectiveScore < UNCERTAIN_MIN || effectiveScore > UNCERTAIN_MAX) return null;

  const cacheKey = `txn_${senderAccount.id}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.result, fromCache: true };
  }

  const prompt = buildPrompt(transaction, senderAccount, mlResult, riskProfile, effectiveScore);

  try {
    const { text, model } = await callLLM(prompt);
    const result = parseLLMResponse(text, model);
    analysisCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    logger.error("LLM analyseTransaction error", { error: err.message });
    return null;
  }
}

// ─── Force Analyse (on-demand, bypass score gating) ──────────────────────────
async function forceAnalyse(transaction, senderAccount, mlResult, riskProfile) {
  const cacheKey = `force_${transaction.id}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.result, fromCache: true };
  }

  const effectiveScore = riskProfile
    ? Math.max(mlResult.fraudScore, riskProfile.compositeScore)
    : mlResult.fraudScore;

  const prompt = buildPrompt(transaction, senderAccount, mlResult, riskProfile, effectiveScore);

  try {
    logger.info(`[LLM] Force analysis for ${transaction.transactionId} (provider: ${LLM_PROVIDER})`);
    const { text, model, provider } = await callLLM(prompt);
    const result = parseLLMResponse(text, model);
    logger.info(`[LLM] Verdict: ${result.verdict} via ${provider}`);
    analysisCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    const msg = err.message || "Unknown error";
    logger.error("LLM forceAnalyse error", { error: msg });

    if (msg === "LLM timeout")           return errorResult("TIMEOUT", "AI service timed out. Retry shortly.", LLM_PROVIDER);
    if (msg === "OPENAI_NOT_CONFIGURED") return errorResult("UNAVAILABLE", "OpenAI API key not set in .env.", "openai");
    if (msg === "NO_LLM_AVAILABLE")      return errorResult("UNAVAILABLE", "No LLM available. Set OPENAI_API_KEY or start Ollama.", "none");
    if (msg.includes("429") || msg.includes("quota")) return errorResult("RATE_LIMITED", "Rate limit hit. Wait 60s and retry.", LLM_PROVIDER);
    return errorResult("ERROR", msg, LLM_PROVIDER);
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────
function isLLMAvailable() {
  const hasOpenAI = !!(process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith("sk-your"));
  return hasOpenAI || LLM_PROVIDER === "ollama" || LLM_PROVIDER === "auto";
}

function clearCache() {
  analysisCache.clear();
}

module.exports = { analyseTransaction, forceAnalyse, isLLMAvailable, clearCache, warmupOllama };
