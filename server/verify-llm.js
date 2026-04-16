require("dotenv").config();
console.log("Loaded ENV var LLM_PROVIDER:", process.env.LLM_PROVIDER);
console.log("Loaded ENV var OLLAMA_MODEL:", process.env.OLLAMA_MODEL);

const { forceAnalyse, warmupOllama } = require("./services/llmService.js");

const dummyTxn = {
  transactionId: "TXN-TEST-123",
  amount: 154000,
  type: "IMPS",
  channel: "MOBILE_APP",
  timestamp: new Date().toISOString(),
  description: "Test transfer"
};

const dummySender = {
  id: "C_TEST_001",
  bankName: "State Bank of India",
  kycType: "FULL",
  riskScore: 0.1,
  muleScore: 0.0
};

const dummyMl = {
  fraudScore: 0.85,
  reasons: [{ feature: "amount", description: "Unusually high amount for account age" }]
};

const dummyRisk = {
  compositeScore: 0.8,
  dominantLayer: "ml",
  layers: { ml: 0.85, rule: 0.2 }
};

async function verify() {
  console.log("\n[LLM Verification] Warming up Ollama...");
  await warmupOllama();

  console.log("\n[LLM Verification] Running analysis...");
  const start = Date.now();
  const result = await forceAnalyse(dummyTxn, dummySender, dummyMl, dummyRisk);
  const duration = Date.now() - start;
  
  console.log("\n[LLM Verification] Analysis complete! Time taken:", duration, "ms");
  console.log("[LLM Verification] Result Details:\n", JSON.stringify(result, null, 2));

  // Exit checking if the model matches
  if (result && result.model === "qwen3:8b") {
    console.log("\n✅ SUCCESS: qwen3:8b is successfully handling requests!");
  } else {
    console.log("\n❌ FAILED: Unexpected model or analysis failure.");
  }
}

verify().catch(e => { 
  console.error("Verification error:", e); 
  process.exit(1); 
});
