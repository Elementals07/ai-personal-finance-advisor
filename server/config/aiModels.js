const DEFAULT_MODEL = 'qwen/qwen3.7-flash';
const GEMINI_MODEL = 'gemini-2.5-flash';
const configuredModel = (name) => process.env[name]?.trim() || DEFAULT_MODEL;

const AI_MODELS = Object.freeze({
    chatbot: configuredModel('AI_MODEL_CHATBOT'),
    financialAnalysis: configuredModel('AI_MODEL_FINANCIAL_ANALYSIS'),
    receiptScanning: configuredModel('AI_MODEL_RECEIPT_SCANNING'),
    smsTransactionParsing: configuredModel('AI_MODEL_SMS_TRANSACTION_PARSING')
});

const MODEL_FEATURES = Object.freeze({
    analysis: 'financialAnalysis',
    chat: 'chatbot',
    'receipt-scan': 'receiptScanning',
    'receipt_scan': 'receiptScanning',
    'sms-parse': 'smsTransactionParsing',
    'sms_parse': 'smsTransactionParsing'
});

function getDefaultModel(feature) {
    const selection = MODEL_FEATURES[feature];
    if (!selection) throw new Error(`Unsupported AI feature: ${feature}`);
    return AI_MODELS[selection];
}

function getConfiguredModels() {
    return { ...AI_MODELS };
}

module.exports = { AI_MODELS, GEMINI_MODEL, DEFAULT_MODEL, MODEL_FEATURES, getDefaultModel, getConfiguredModels };
