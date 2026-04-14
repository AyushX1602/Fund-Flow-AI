/**
 * llmService.js — Gemini LLM "Third Brain" for Fraud Reasoning
 *
 * ONLY called for uncertain transactions (effectiveScore 0.35–0.75).
 * Clear fraud (>0.75) and clear safe (<0.35) don't need LLM reasoning.
 *
 * Rate limit protection (free tier: ~15 RPM):
 *   1. Score gating     — only uncertain zone triggers a call
 *   2. In-memory cache  — same sender account reused for 10 minutes
 *   3. Request queue    — enforces min 4s gap between calls (~15/min max)
 *   4. Timeout          — 8s hard limit, returns null on timeout (no crash)
 *   5. Graceful fallback— if API key missing or quota hit, returns null silently
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger = require("../utils/logger");

// ─── Config ───────────────────────────────────────────────────────────────
const UNCERTAIN_MIN = 0.35;
const UNCERTAIN_MAX = 0.75;
const CACHE_TTL_MS  = 30 * 60 * 1000;  // 30 min cache (halves quota usage)
const MIN_GAP_MS    = 4000;            // 4s between calls = max 15/min (exact free-tier limit)
const CALL_TIMEOUT  = 25000;           // 25s — generous timeout
const MAX_DAILY     = 100;            // Raised cap — gemini free tier allows 1500 RPD

// ─── State ────────────────────────────────────────────────────────────────
let genAI = null;
let model = null;
let lastCallTime = 0;
let dailyCallCount = 0;
function getNextMidnight() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}
let dailyResetAt = getNextMidnight();

// In-memory cache: senderAccountId → { result, expiresAt }
const analysisCache = new Map();

// ─── Init ─────────────────────────────────────────────────────────────────
function getModel() {
  if (model) return model;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return null;
  }
  genAI = new GoogleGenerativeAI(apiKey);
  // gemini-1.5-flash: higher RPD quota than 2.0-flash on free tier
  model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-04-17" });
  logger.info("Gemini LLM service initialized (gemini-1.5-flash)");
  return model;
}

/**
 * Main entry: analyse a suspicious transaction with Gemini.
 * Returns null silently if: API key missing, quota hit, timeout, or score out of uncertain range.
 *
 * @param {Object} transaction   - Scored transaction from DB
 * @param {Object} senderAccount - Sender account info
 * @param {Object} mlResult      - { fraudScore, reasons[] }
 * @param {Object} riskProfile   - { compositeScore, layers, dominantLayer }
 * @returns {Object|null}        - { verdict, confidence, reasoning, flags[] } or null
 */
async function analyseTransaction(transaction, senderAccount, mlResult, riskProfile) {
  const effectiveScore = riskProfile
    ? Math.max(mlResult.fraudScore, riskProfile.compositeScore)
    : mlResult.fraudScore;

  // ── Gate 1: Only uncertain zone ────────────────────────────────────────
  if (effectiveScore < UNCERTAIN_MIN || effectiveScore > UNCERTAIN_MAX) {
    return null;
  }

  // ── Gate 2: Daily quota guard ──────────────────────────────────────────
  if (Date.now() > dailyResetAt) {
    dailyCallCount = 0;
    dailyResetAt = getNextMidnight();
  }
  if (dailyCallCount >= MAX_DAILY) {
    logger.warn(`Gemini daily cap (${MAX_DAILY}) reached — skipping LLM analysis`);
    return null;
  }

  // ── Gate 2: Cache check ────────────────────────────────────────────────
  const cacheKey = `${senderAccount.id}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    logger.debug(`LLM cache hit for account ${senderAccount.id}`);
    return { ...cached.result, fromCache: true };
  }

  // ── Gate 3: Model available ────────────────────────────────────────────
  const llmModel = getModel();
  if (!llmModel) {
    logger.debug("Gemini API key not configured — skipping LLM analysis");
    return null;
  }

  // ── Gate 4: Rate limit (min 4s between calls) ─────────────────────────
  const now = Date.now();
  const waitMs = Math.max(0, MIN_GAP_MS - (now - lastCallTime));
  if (waitMs > 0) {
    await new Promise(r => setTimeout(r, waitMs));
  }
  lastCallTime = Date.now();

  // ── Build prompt ───────────────────────────────────────────────────────
  const prompt = buildPrompt(transaction, senderAccount, mlResult, riskProfile, effectiveScore);

  try {
    logger.info(`Gemini LLM analysis for txn ${transaction.transactionId} (score: ${effectiveScore}, daily: ${dailyCallCount + 1}/${MAX_DAILY})`);
    dailyCallCount++;

    // Hard timeout wrapper
    const result = await Promise.race([
      llmModel.generateContent(prompt),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("LLM timeout")), CALL_TIMEOUT)
      ),
    ]);

    const text = result.response.text();
    const parsed = parseGeminiResponse(text);

    // Cache by sender account
    analysisCache.set(cacheKey, {
      result: parsed,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return parsed;
  } catch (err) {
    if (err.message === "LLM timeout") {
      logger.warn(`Gemini timeout for txn ${transaction.transactionId}`);
    } else if (err.message?.includes("429") || err.message?.includes("quota")) {
      logger.warn("Gemini rate limit hit — will retry after cache expires");
    } else {
      logger.error("Gemini LLM error", { error: err.message });
    }
    return null; // Always fail gracefully — never crash the pipeline
  }
}

// ─── Prompt Builder ────────────────────────────────────────────────────────
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
- Effective Score: ${effectiveScore.toFixed(3)} (UNCERTAIN ZONE — needs LLM reasoning)
- Dominant Risk Layer: ${riskProfile?.dominantLayer || "ml"}
- Layer Breakdown: ${layerSummary}

TOP ML REASONS:
${topReasons || "- No specific reasons flagged"}

TASK: This transaction is in the uncertain zone (score ${effectiveScore.toFixed(2)}). The automated systems are not confident. Provide:
1. VERDICT: SUSPICIOUS or MONITOR or CLEAR (one word)
2. CONFIDENCE: 0.0 to 1.0
3. REASONING: 2-3 sentences max explaining why in plain English
4. FLAGS: up to 3 specific red flags or green flags

Respond ONLY in this exact JSON format:
{
  "verdict": "SUSPICIOUS",
  "confidence": 0.72,
  "reasoning": "Your reasoning here.",
  "flags": ["flag1", "flag2", "flag3"]
}`;
}

// ─── Response Parser ───────────────────────────────────────────────────────
function parseGeminiResponse(text) {
  try {
    // Extract JSON from response (Gemini sometimes wraps in markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      verdict:    parsed.verdict    || "MONITOR",
      confidence: parseFloat(parsed.confidence) || 0.5,
      reasoning:  parsed.reasoning  || "LLM analysis inconclusive.",
      flags:      Array.isArray(parsed.flags) ? parsed.flags.slice(0, 3) : [],
      fromCache:  false,
      model:      "gemini-2.5-flash-preview-04-17",
    };
  } catch {
    // If Gemini returns unstructured text, extract what we can
    return {
      verdict:    "MONITOR",
      confidence: 0.5,
      reasoning:  text.slice(0, 300),
      flags:      [],
      fromCache:  false,
      model:      "gemini-2.5-flash-preview-04-17",
    };
  }
}

/**
 * Force-analyse a transaction with Gemini (bypass score gating).
 * Used by the Investigation review queue for on-demand human-triggered analysis.
 * Still respects daily quota and rate limits.
 *
 * @param {Object} transaction   - Full transaction from DB (with accounts)
 * @param {Object} senderAccount
 * @param {Object} mlResult      - { fraudScore, reasons[] }
 * @param {Object} riskProfile   - { compositeScore, layers, dominantLayer }
 * @returns {Object|null}
 */
async function forceAnalyse(transaction, senderAccount, mlResult, riskProfile) {
  // ── Gate: Daily quota guard ────────────────────────────────────────────
  if (Date.now() > dailyResetAt) {
    dailyCallCount = 0;
    dailyResetAt = getNextMidnight();
  }
  if (dailyCallCount >= MAX_DAILY) {
    logger.warn(`Gemini daily cap (${MAX_DAILY}) reached — skipping forced analysis`);
    return { verdict: "QUOTA_EXHAUSTED", confidence: 0, reasoning: `Gemini daily quota (${MAX_DAILY} calls) exhausted. Resets at midnight.`, flags: [], model: "gemini-2.5-flash-preview-04-17" };
  }

  // ── Cache check ────────────────────────────────────────────────────────
  const cacheKey = `force_${transaction.id}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.result, fromCache: true };
  }

  // ── Model available ────────────────────────────────────────────────────
  const llmModel = getModel();
  if (!llmModel) {
    return { verdict: "UNAVAILABLE", confidence: 0, reasoning: "Gemini API key not configured. Add GEMINI_API_KEY to .env.", flags: [], model: "gemini-2.5-flash-preview-04-17" };
  }

  // ── Rate limit ─────────────────────────────────────────────────────────
  const now = Date.now();
  const waitMs = Math.max(0, MIN_GAP_MS - (now - lastCallTime));
  if (waitMs > 0) {
    await new Promise(r => setTimeout(r, waitMs));
  }
  lastCallTime = Date.now();

  const effectiveScore = riskProfile
    ? Math.max(mlResult.fraudScore, riskProfile.compositeScore)
    : mlResult.fraudScore;

  const prompt = buildPrompt(transaction, senderAccount, mlResult, riskProfile, effectiveScore);

  try {
    logger.info(`Gemini FORCED analysis for txn ${transaction.transactionId} (score: ${effectiveScore}, daily: ${dailyCallCount + 1}/${MAX_DAILY})`);
    dailyCallCount++;

    const result = await Promise.race([
      llmModel.generateContent(prompt),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("LLM timeout")), CALL_TIMEOUT)
      ),
    ]);

    const text = result.response.text();
    const parsed = parseGeminiResponse(text);

    // Cache by transaction ID
    analysisCache.set(cacheKey, {
      result: parsed,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return parsed;
  } catch (err) {
    if (err.message === "LLM timeout") {
      logger.warn(`Gemini timeout for forced analysis txn ${transaction.transactionId}`);
      return { verdict: "TIMEOUT", confidence: 0, reasoning: "Gemini API timed out after 20 seconds. Try again.", flags: [], model: "gemini-2.5-flash-preview-04-17" };
    } else if (err.message?.includes("429") || err.message?.includes("quota")) {
      logger.warn("Gemini rate limit on forced analysis");
      return { verdict: "RATE_LIMITED", confidence: 0, reasoning: "Gemini API rate limit hit (free tier: ~15 RPM). Wait 60 seconds.", flags: [], model: "gemini-2.5-flash-preview-04-17" };
    }
    logger.error("Gemini forced analysis error", { error: err.message });
    return { verdict: "ERROR", confidence: 0, reasoning: err.message || "Unknown error", flags: [], model: "gemini-2.5-flash-preview-04-17" };
  }
}

/**
 * Check if LLM service is configured and available.
 */
function isLLMAvailable() {
  const key = process.env.GEMINI_API_KEY;
  return !!(key && key !== "your_gemini_api_key_here");
}

/**
 * Clear the analysis cache (useful for testing).
 */
function clearCache() {
  analysisCache.clear();
}

module.exports = { analyseTransaction, forceAnalyse, isLLMAvailable, clearCache };

