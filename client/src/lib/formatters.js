/**
 * Formatting and display utilities for FundFlow AI.
 */

/** Format amount as Indian Rupees */
export function formatINR(amount) {
  if (amount == null) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format large amounts compactly (e.g., ₹4.2L, ₹1.5Cr) */
export function formatINRCompact(amount) {
  if (amount == null) return "₹0";
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount}`;
}

/** Format fraud score as a percentage string with color hint */
export function formatScore(score) {
  if (score == null) return "—";
  return (score * 1).toFixed(2);
}

/** Get severity badge variant */
export function getSeverityVariant(severity) {
  switch (severity) {
    case "CRITICAL": return "destructive";
    case "HIGH": return "default";
    case "MEDIUM": return "secondary";
    case "LOW": return "outline";
    default: return "secondary";
  }
}

/** Get risk color class based on score */
export function getRiskColor(score) {
  if (score >= 0.8) return "text-destructive";
  if (score >= 0.6) return "text-orange-600";
  if (score >= 0.4) return "text-amber-600";
  return "text-emerald-600";
}

/** Get risk bar color for progress bars */
export function getRiskBarColor(score) {
  if (score >= 0.8) return "bg-destructive";
  if (score >= 0.6) return "bg-orange-500";
  if (score >= 0.4) return "bg-amber-500";
  return "bg-emerald-500";
}

/** Format date/time for display */
export function formatDateTime(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Format relative time (e.g., "2m ago") */
export function formatRelativeTime(date) {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** Truncate a string with ellipsis */
export function truncate(str, maxLen = 20) {
  if (!str || str.length <= maxLen) return str;
  return str.substring(0, maxLen) + "…";
}

/** Map alert type to human-readable name */
export function getAlertTypeName(type) {
  const names = {
    HIGH_VALUE: "High Value",
    VELOCITY: "Velocity",
    MULE_ACCOUNT: "Mule Account",
    STRUCTURING: "Structuring",
    SUSPICIOUS_PATTERN: "Suspicious Pattern",
    KYC_RISK: "KYC Risk",
    UNUSUAL_HOUR: "Unusual Hour",
    CROSS_BORDER: "Cross Border",
  };
  return names[type] || type;
}

/** KYC type badge color */
export function getKycColor(type) {
  switch (type) {
    case "FULL_KYC": return "text-emerald-600";
    case "OTP_BASED": return "text-amber-600";
    case "MIN_KYC": return "text-destructive";
    default: return "text-muted-foreground";
  }
}
