const prisma = require("../prismaClient");
const mlService = require("../services/mlService");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

/**
 * POST /api/ml/score
 * Score a single transaction (proxy to FastAPI or rule-based fallback)
 */
async function score(req, res, next) {
  try {
    const { transactionId } = req.body;

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { senderAccount: true, receiverAccount: true },
    });

    if (!transaction) throw ApiError.notFound("Transaction not found");

    const result = await mlService.scoreTransaction(
      transaction,
      transaction.senderAccount,
      transaction.receiverAccount
    );

    // Update transaction with new score
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        fraudScore: result.fraudScore,
        isFraud: result.isFraud,
        mlModelVersion: result.modelVersion,
        mlReasons: result.reasons,
      },
    });

    ApiResponse.success(result, "Transaction scored").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/ml/batch-score
 * Score multiple transactions
 */
async function batchScore(req, res, next) {
  try {
    const { transactionIds } = req.body;
    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      throw ApiError.badRequest("Provide an array of transaction IDs");
    }

    const results = [];
    for (const id of transactionIds) {
      try {
        const transaction = await prisma.transaction.findUnique({
          where: { id },
          include: { senderAccount: true, receiverAccount: true },
        });

        if (!transaction) {
          results.push({ transactionId: id, error: "Not found" });
          continue;
        }

        const result = await mlService.scoreTransaction(
          transaction,
          transaction.senderAccount,
          transaction.receiverAccount
        );

        await prisma.transaction.update({
          where: { id },
          data: {
            fraudScore: result.fraudScore,
            isFraud: result.isFraud,
            mlModelVersion: result.modelVersion,
            mlReasons: result.reasons,
          },
        });

        results.push({ transactionId: id, ...result });
      } catch (error) {
        results.push({ transactionId: id, error: error.message });
      }
    }

    ApiResponse.success(results, `Scored ${results.length} transactions`).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/ml/model-info
 */
async function getModelInfo(req, res, next) {
  try {
    const modelInfo = await mlService.getModelInfo();

    // Also get active models from DB
    const dbModels = await prisma.modelMetadata.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    ApiResponse.success({
      activeModel: modelInfo,
      registeredModels: dbModels,
      fastApiAvailable: await mlService.isFastApiAvailable(),
    }).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/ml/explain/:transactionId
 * Get SHAP explanation for a scored transaction
 */
async function explain(req, res, next) {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: req.params.transactionId },
      select: { id: true, transactionId: true, mlReasons: true, fraudScore: true, mlModelVersion: true },
    });

    if (!transaction) throw ApiError.notFound("Transaction not found");

    const explanation = await mlService.getExplanation(
      transaction.transactionId,
      transaction.mlReasons
    );

    ApiResponse.success({
      transactionId: transaction.transactionId,
      fraudScore: transaction.fraudScore,
      modelVersion: transaction.mlModelVersion,
      explanation,
    }).send(res);
  } catch (error) {
    next(error);
  }
}

module.exports = { score, batchScore, getModelInfo, explain };
