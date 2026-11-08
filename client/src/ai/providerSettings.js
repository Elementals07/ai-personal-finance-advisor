const geminiApiKeys = new Map();
const AI_MODEL_FEATURES = Object.freeze({
    chatbot: 'chatbot',
    financialAnalysis: 'financialAnalysis',
    receiptScanning: 'receiptScanning',
    smsTransactionParsing: 'smsTransactionParsing'
});

function currentUserKey() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        return String(user?.id || 'default');
    } catch {
        return 'default';
    }
}

function providerPreferenceKey() {
    return `financeai-ai-provider:${currentUserKey()}`;
}

function modelPreferenceKey() {
    return `financeai-ai-models:${currentUserKey()}`;
}

export function getAIModelSelections() {
    try {
        const saved = JSON.parse(localStorage.getItem(modelPreferenceKey()) || '{}');
        return Object.fromEntries(
            Object.keys(AI_MODEL_FEATURES)
                .filter(feature => typeof saved?.[feature] === 'string' && saved[feature].trim())
                .map(feature => [feature, saved[feature].trim()])
        );
    } catch {
        return {};
    }
}

export function setAIModelSelection(feature, modelId) {
    if (!Object.prototype.hasOwnProperty.call(AI_MODEL_FEATURES, feature) ||
        typeof modelId !== 'string' || !modelId.trim()) {
        throw new Error('Choose a valid AI model.');
    }
    try {
        const selections = getAIModelSelections();
        selections[feature] = modelId.trim();
        localStorage.setItem(modelPreferenceKey(), JSON.stringify(selections));
    } catch {
        throw new Error('Could not save the AI model preference in this browser.');
    }
}

export function getAIProvider() {
    try {
        return localStorage.getItem(providerPreferenceKey()) === 'gemini'
            ? 'gemini'
            : 'velona';
    } catch {
        return 'velona';
    }
}

export function setAIProvider(provider) {
    if (provider !== 'velona' && provider !== 'gemini') {
        throw new Error('Unsupported AI provider.');
    }
    try {
        localStorage.setItem(providerPreferenceKey(), provider);
    } catch {
        throw new Error('Could not save the AI provider preference in this browser.');
    }
}

export function setPersonalGeminiKey(key) {
    const value = String(key || '').trim();
    const userKey = currentUserKey();
    if (value) geminiApiKeys.set(userKey, value);
    else geminiApiKeys.delete(userKey);
}

export function hasPersonalGeminiKey() {
    return Boolean(geminiApiKeys.get(currentUserKey()));
}

export function getAIRequestHeaders() {
    const provider = getAIProvider();
    const headers = { 'x-ai-provider': provider };
    const geminiApiKey = geminiApiKeys.get(currentUserKey());
    if (provider === 'gemini' && geminiApiKey) {
        headers['x-gemini-key'] = geminiApiKey;
    }
    const modelHeaders = {
        chatbot: 'x-ai-model-chatbot',
        financialAnalysis: 'x-ai-model-financial-analysis',
        receiptScanning: 'x-ai-model-receipt-scanning',
        smsTransactionParsing: 'x-ai-model-sms-transaction-parsing'
    };
    const modelSelections = getAIModelSelections();
    for (const [feature, header] of Object.entries(modelHeaders)) {
        const model = modelSelections[feature];
        if (model) headers[header] = model;
    }
    return headers;
}
