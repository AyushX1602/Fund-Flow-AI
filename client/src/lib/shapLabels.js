/**
 * SHAP Feature → Human-readable label mapping.
 * Used by ShapExplanation component to display banking terms instead of raw feature names.
 */
const SHAP_LABELS = {
  // ── Rule-based fallback features (12) ──
  amount:              "Transaction Amount",
  amount_channel:      "Amount vs Channel Risk",
  near_50k_threshold:  "Near ₹50K PMLA Reporting Threshold",
  near_10l_threshold:  "Near ₹10 Lakh PMLA Reporting Threshold",
  kyc_type:            "KYC Verification Level",
  kyc_flagged:         "KYC Flagged by Compliance",
  sender_mule_score:   "Sender Mule Account Score",
  receiver_mule_score: "Receiver Mule Account Score",
  cross_bank:          "Cross-Bank Transfer Risk",
  account_age:         "New Account Risk",
  vpa_age:             "UPI VPA Age Risk",
  unusual_hour:        "Unusual Transaction Hour (1-5 AM)",
  frozen_receiver:     "Receiver Account Frozen",

  // ── FastAPI ML features ──
  sender_txn_count_1h:       "Transaction Velocity (Last 1 Hour)",
  sender_txn_count_24h:      "Transaction Velocity (Last 24 Hours)",
  balance_drained:           "Account Balance Nearly Emptied",
  is_round_10k:              "Suspiciously Round Amount (₹10K Multiple)",
  sender_in_ring:            "Sender Part of Detected Fraud Ring",
  receiver_in_ring:          "Receiver Part of Detected Fraud Ring",
  receiver_is_pure_receiver: "Receiver Never Sends — Terminal Mule",
  dormant_activation:        "Dormant Account Suddenly Activated",
  amount_deviation:          "Amount Deviation from Account History",
};

/** Get the human-readable label for a SHAP feature. Falls back to title-cased key. */
export function getShapLabel(key) {
  return SHAP_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Get the impact bar color class based on impact magnitude */
export function getImpactColor(impact) {
  if (impact >= 0.2) return "bg-destructive";
  if (impact >= 0.1) return "bg-warning";
  return "bg-muted-foreground/50";
}

export default SHAP_LABELS;
