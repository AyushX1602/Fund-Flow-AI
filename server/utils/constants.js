/**
 * Application-wide constants and defaults.
 */

// Pagination defaults
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

// Audit log action types
const AUDIT_ACTIONS = {
  // Account
  FREEZE_ACCOUNT: "FREEZE_ACCOUNT",
  UNFREEZE_ACCOUNT: "UNFREEZE_ACCOUNT",
  CREATE_ACCOUNT: "CREATE_ACCOUNT",
  UPDATE_ACCOUNT: "UPDATE_ACCOUNT",

  // Alert
  CREATE_ALERT: "CREATE_ALERT",
  ASSIGN_ALERT: "ASSIGN_ALERT",
  ESCALATE_ALERT: "ESCALATE_ALERT",
  RESOLVE_ALERT: "RESOLVE_ALERT",
  UPDATE_ALERT_STATUS: "UPDATE_ALERT_STATUS",

  // Investigation
  CREATE_INVESTIGATION: "CREATE_INVESTIGATION",
  CLOSE_INVESTIGATION: "CLOSE_INVESTIGATION",
  LINK_ALERT_TO_CASE: "LINK_ALERT_TO_CASE",

  // Simulation
  START_SIMULATION: "START_SIMULATION",
  STOP_SIMULATION: "STOP_SIMULATION",

  // Auth
  USER_LOGIN: "USER_LOGIN",
  USER_REGISTER: "USER_REGISTER",
};

// Socket event names
const SOCKET_EVENTS = {
  TRANSACTION_NEW: "transaction:new",
  TRANSACTION_SCORED: "transaction:scored",
  ALERT_CREATED: "alert:created",
  ALERT_UPDATED: "alert:updated",
  SIMULATION_PROGRESS: "simulation:progress",
  ACCOUNT_FROZEN: "account:frozen",
  FREEZE_SIMULATE_RESULT: "freeze-simulate:result",
};

// Severity order for comparisons
const SEVERITY_ORDER = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

// Indian bank names for simulation
const INDIAN_BANKS = [
  "State Bank of India",
  "Punjab National Bank",
  "Bank of Baroda",
  "Canara Bank",
  "Union Bank of India",
  "Bank of India",
  "Indian Bank",
  "Central Bank of India",
  "UCO Bank",
  "Indian Overseas Bank",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "Yes Bank",
];

// Indian PSPs (Payment Service Providers)
const INDIAN_PSPS = [
  "GPAY",
  "PHONEPE",
  "PAYTM",
  "BHIM",
  "AMAZONPAY",
  "WHATSAPP",
  "CRED",
  "FAMPAY",
];

module.exports = {
  PAGINATION,
  AUDIT_ACTIONS,
  SOCKET_EVENTS,
  SEVERITY_ORDER,
  INDIAN_BANKS,
  INDIAN_PSPS,
};
