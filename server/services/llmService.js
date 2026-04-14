/**
 * llmService.js — Dual-Brain LLM Service
 *
 * Supports two LLM providers:
 *   1. Ollama  (local, no rate limits, offline, RTX 4050 6GB friendly)
 *   2. Gemini  (cloud, free tier: ~15 RPM)
 *
 * Set LLM_PROVIDER in .env:
 *   LLM_PROVIDER=ollama   → use Ollama only
 *   LLM_PROVIDER=gemini   → use Gemini only
 *   LLM_PROVIDER=auto     → try Ollama first, fall back to Gemini (default)
 *
 * Ollama setup:
 *   1. Install: https://ollama.com/download/windows
 *   2. Pull model: ollama pull mistral:7b-instruct  (4GB, fits RTX 4050 6GB)
 *      Or lighter: ollama pull llama3.2:3b           (2GB, faster)
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const logger = require("../utils/logger");

// ─── Config ──────────────────────────────────────────────────────────────────
const UNCERTAIN_MIN   = 0.35;
const UNCERTAIN_MAX   = 0.75;
const CACHE_TTL_MS    = 30 * 60 * 1000; // 30 min cache
const MIN_GAP_MS      = 4000;           // 4s between Gemini calls (15 RPM)
const GEMINI_TIMEOUT  = 25000;          // 25s for Gemini cloud
const OLLAMA_TIMEOUT  = 90000;          // 90s for Ollama (cold start loads model into VRAM)
const MAX_DAILY       = 100;            // Gemini daily cap

// Ollama config
const OLLAMA_URL      = process.env.OLLAMA_URL      || "http://localhost:11434";
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL    || "mistral:7b-instruct";
const LLM_PROVIDER    = process.env.LLM_PROVIDER    || "auto"; // ollama | gemini | auto

// Gemini model
const GEMINI_MODEL    = process.env.GEMINI_MODEL    || "gemini-2.5-flash-preview-04-17";

// ─── State ────────────────────────────────────────────────────────────────────
let geminiModel   = null;
let lastCallTime  = 0;
let dailyCallCount = 0;
let ollamaWarmedUp = false;

function getNextMidnight() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}
let dailyResetAt = getNextMidnight();

const analysisCache = new Map();

// ─── Gemini Init ─────────────────────────────────────────────────────────────
function getGeminiModel() {
  if (geminiModel) return geminiModel;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") return null;
  const genAI = new GoogleGenerativeAI(apiKey);
  geminiModel = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  logger.info(`Gemini LLM initialized (${GEMINI_MODEL})`);
  return geminiModel;
}

// ─── Ollama Availability Check ────────────────────────────────────────────────
async function isOllamaRunning() {
  try {
    const res = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 2000 });
    const models = res.data?.models || [];
    const available = models.some(m => m.name?.startsWith(OLLAMA_MODEL.split(":")[0]));
    return available;
  } catch {
    return false;
  }
}

// ─── Ollama Call ──────────────────────────────────────────────────────────────
async function callOllama(prompt) {
  const timeout = ollamaWarmedUp ? 60000 : OLLAMA_TIMEOUT; // 60s normal, 90s cold start
  const res = await axios.post(
    `${OLLAMA_URL}/api/generate`,
    {
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.1, num_predict: 400 },
    },
    { timeout }
  );
  ollamaWarmedUp = true;
  return res.data?.response || "";
}

// ─── Ollama Warmup (preload model into VRAM on server start) ─────────────────
async function warmupOllama() {
  if (LLM_PROVIDER !== "ollama" && LLM_PROVIDER !== "auto") return;
  const running = await isOllamaRunning();
  if (!running) {
    logger.info("Ollama not running — skipping warmup");
    return;
  }
  logger.info(`Warming up Ollama (${OLLAMA_MODEL}) — loading model into VRAM...`);
  try {
    const start = Date.now();
    await axios.post(
      `${OLLAMA_URL}/api/generate`,
      { model: OLLAMA_MODEL, prompt: "Reply OK", stream: false, options: { num_predict: 5 } },
      { timeout: OLLAMA_TIMEOUT }
    );
    ollamaWarmedUp = true;
    logger.info(`Ollama warmup complete in ${((Date.now() - start) / 1000).toFixed(1)}s — model loaded into VRAM`);
  } catch (err) {
    logger.warn(`Ollama warmup failed: ${err.message}`);
  }
}

// ─── Gemini Call ──────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  // Rate limit guard
  if (Date.now() > dailyResetAt) { dailyCallCount = 0; dailyResetAt = getNextMidnight(); }
  if (dailyCallCount >= MAX_DAILY) throw new Error("QUOTA_EXHAUSTED");

  const now = Date.now();
  const waitMs = Math.max(0, MIN_GAP_MS - (now - lastCallTime));
  if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
  lastCallTime = Date.now();

  const model = getGeminiModel();
  if (!model) throw new Error("GEMINI_NOT_CONFIGURED");

  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise((_, reject) => setTimeout(() => reject(new Error("LLM timeout")), GEMINI_TIMEOUT)),
  ]);
  dailyCallCount++;
  return result.response.text();
}

// ─── Smart Router ─────────────────────────────────────────────────────────────
async function callLLM(prompt, context = "auto") {
  const provider = context === "force" ? LLM_PROVIDER : LLM_PROVIDER;

  if (provider === "ollama") {
    const text = await callOllama(prompt);
    return { text, model: OLLAMA_MODEL, provider: "ollama" };
  }

  if (provider === "gemini") {
    const text = await callGemini(prompt);
    return { text, model: GEMINI_MODEL, provider: "gemini" };
  }

  // "auto" — try Ollama first, fall back to Gemini
  const ollamaUp = await isOllamaRunning();
  if (ollamaUp) {
    try {
      logger.info(`Using Ollama (${OLLAMA_MODEL}) for LLM analysis`);
      const text = await callOllama(prompt);
      return { text, model: OLLAMA_MODEL, provider: "ollama" };
    } catch (err) {
      logger.warn(`Ollama failed (${err.message}), falling back to Gemini`);
    }
  }

  logger.info(`Using Gemini (${GEMINI_MODEL}) for LLM analysis`);
  const text = await callGemini(prompt);
  return { text, model: GEMINI_MODEL, provider: "gemini" };
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
- Remarks: "${transaction.description || '(none)'}"

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
    const jsonMatch = text.match(/\{[\s\S]*\}/);
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
      verdict:   "MONITOR",
      confidence: 0.5,
      reasoning:  text.slice(0, 300),
      flags:      [],
      fromCache:  false,
      model:      modelName,
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
    logger.info(`Forced LLM analysis for txn ${transaction.transactionId} (provider: ${LLM_PROVIDER})`);
    const { text, model, provider } = await callLLM(prompt, "force");
    const result = parseLLMResponse(text, model);
    logger.info(`LLM result: ${result.verdict} (${provider})`);
    analysisCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    const msg = err.message || "Unknown error";
    logger.error("LLM forceAnalyse error", { error: msg });

    if (msg === "QUOTA_EXHAUSTED") {
      return errorResult("QUOTA_EXHAUSTED", `Daily AI quota (${MAX_DAILY} calls) exhausted. Resets at midnight.`, GEMINI_MODEL);
    }
    if (msg === "LLM timeout") {
      return errorResult("TIMEOUT", "AI service timed out. Try again in a moment.", LLM_PROVIDER);
    }
    if (msg.includes("429") || msg.includes("quota") || msg.includes("RATE_LIMITED")) {
      return errorResult("RATE_LIMITED", "Rate limit reached. Wait ~60 seconds and retry.", GEMINI_MODEL);
    }
    if (msg === "GEMINI_NOT_CONFIGURED") {
      return errorResult("UNAVAILABLE", "No LLM configured. Install Ollama or add GEMINI_API_KEY to .env.", "none");
    }
    return errorResult("ERROR", msg, LLM_PROVIDER);
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function isLLMAvailable() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const hasGemini = !!(geminiKey && geminiKey !== "your_gemini_api_key_here");
  // Ollama availability is checked at runtime — assume available if provider is set to ollama
  return hasGemini || LLM_PROVIDER === "ollama" || LLM_PROVIDER === "auto";
}

function clearCache() {
  analysisCache.clear();
}

module.exports = { analyseTransaction, forceAnalyse, isLLMAvailable, clearCache, warmupOllama };
