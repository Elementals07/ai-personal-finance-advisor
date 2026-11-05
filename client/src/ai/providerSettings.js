const geminiApiKeys = new Map();

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
    return headers;
}
