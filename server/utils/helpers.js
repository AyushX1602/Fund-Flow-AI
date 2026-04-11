const { v4: uuidv4 } = require("uuid");

/**
 * Mask account number for API responses.
 * "1234567890" → "ACC_****7890"
 */
function maskAccountNumber(accountNumber) {
  if (!accountNumber || accountNumber.length < 4) return "ACC_****";
  return `ACC_****${accountNumber.slice(-4)}`;
}

/**
 * Generate a unique transaction ID.
 * Format: TXN-{timestamp}-{uuid-short}
 */
function generateTransactionId() {
  const ts = Date.now().toString(36).toUpperCase();
  const id = uuidv4().split("-")[0].toUpperCase();
  return `TXN-${ts}-${id}`;
}

/**
 * Generate a case number for investigations.
 * Format: CASE-{YYYY}-{sequential}
 */
function generateCaseNumber(sequenceNum) {
  const year = new Date().getFullYear();
  const seq = String(sequenceNum).padStart(5, "0");
  return `CASE-${year}-${seq}`;
}

/**
 * Generate a chain ID for fund flow tracking.
 */
function generateChainId() {
  return `CHAIN-${uuidv4().split("-")[0].toUpperCase()}`;
}

/**
 * Parse pagination params from query string.
 */
function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Build pagination metadata for response.
 */
function buildPaginationMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  };
}

/**
 * Parse UPI VPA to extract bank and PSP info.
 * Example: "user@oksbi" → { username: "user", handle: "oksbi", bank: "SBI", psp: "GPAY" }
 */
function parseUpiVpa(vpa) {
  if (!vpa || !vpa.includes("@")) return null;

  const [username, handle] = vpa.split("@");
  const handleMap = {
    oksbi: { bank: "SBI", psp: "GPAY" },
    okaxis: { bank: "AXIS", psp: "GPAY" },
    okhdfcbank: { bank: "HDFC", psp: "GPAY" },
    okicici: { bank: "ICICI", psp: "GPAY" },
    ybl: { bank: "SBI", psp: "PHONEPE" },
    ibl: { bank: "ICICI", psp: "PHONEPE" },
    axl: { bank: "AXIS", psp: "PHONEPE" },
    paytm: { bank: "PAYTM_PAYMENTS_BANK", psp: "PAYTM" },
    apl: { bank: "AXIS", psp: "AMAZONPAY" },
    waicici: { bank: "ICICI", psp: "WHATSAPP" },
    wahdfcbank: { bank: "HDFC", psp: "WHATSAPP" },
    upi: { bank: "UNKNOWN", psp: "BHIM" },
  };

  const info = handleMap[handle.toLowerCase()] || { bank: "UNKNOWN", psp: "UNKNOWN" };
  return { username, handle, ...info };
}

/**
 * Clamp a number between min and max.
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Generate a random amount within range (for simulation).
 */
function randomAmount(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

/**
 * Pick a random item from an array.
 */
function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
  maskAccountNumber,
  generateTransactionId,
  generateCaseNumber,
  generateChainId,
  parsePagination,
  buildPaginationMeta,
  parseUpiVpa,
  clamp,
  randomAmount,
  randomPick,
};
