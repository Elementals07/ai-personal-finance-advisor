const VELONA_MODEL = 'qwen/qwen3.7-flash';
const USD_TO_INR_RATE = Number(process.env.AI_USD_TO_INR_RATE);

const AI_PRICING = {
    velona: {
        model: VELONA_MODEL,
        inputUsdPerMillionTokens: 0.035,
        outputUsdPerMillionTokens: 0.15
    },
    gemini: {
        model: 'gemini-2.5-flash',
        inputUsdPerMillionTokens: null,
        outputUsdPerMillionTokens: null
    },
    budgetInr: 10,
    usdToInrRate: Number.isFinite(USD_TO_INR_RATE) && USD_TO_INR_RATE > 0
        ? USD_TO_INR_RATE
        : null
};

function estimateCostUsd(provider, inputTokens, outputTokens) {
    const pricing = AI_PRICING[provider];
    if (!pricing || pricing.inputUsdPerMillionTokens === null ||
        pricing.outputUsdPerMillionTokens === null) return null;

    return (
        (inputTokens * pricing.inputUsdPerMillionTokens) +
        (outputTokens * pricing.outputUsdPerMillionTokens)
    ) / 1_000_000;
}

module.exports = { AI_PRICING, estimateCostUsd };
