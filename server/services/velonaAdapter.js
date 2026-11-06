const { AI_PRICING, estimateCostUsd } = require('../config/aiPricing');
const AIUsage = require('../models/AIUsage');
const { logAiEvent } = require('../utils/aiLogger');

const API_URL = 'https://velona.in/v1/chat/completions';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 45_000;
const serviceState = { consecutive503s: 0, unavailableUntil: 0 };

class AIProviderError extends Error {
    constructor(statusCode, message, code = 'provider_error') {
        super(message);
        this.name = 'AIProviderError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

function friendlyError(status, body = {}) {
    const providerMessage = [
        body?.error?.message,
        body?.error?.code,
        body?.error?.type,
        body?.message
    ].filter(Boolean).join(' ').toLowerCase();
    if (status === 400) return 'Velona rejected the request. Review the request format or selected model.';
    if (status === 401 || status === 403) return 'Velona authentication failed. Check the server VELONA_API_KEY and account permissions.';
    if (status === 404) return 'The Velona endpoint or configured model is unavailable.';
    if (status === 408) return 'The Velona request timed out. Please try again.';
    if (status === 413) return 'The request is too large for Velona. Reduce the receipt image size and try again.';
    if (status === 422) return 'Velona could not process this request format.';
    if (status === 429 && /quota|insufficient|billing/.test(providerMessage)) {
        return 'Velona quota is exhausted. Check the provider account or switch providers in AI Settings.';
    }
    if (status === 429) return 'Velona is rate limiting requests. Wait briefly or switch providers in AI Settings.';
    if ([500, 502, 503, 504].includes(status)) return 'Velona is temporarily unavailable. Try again later or switch providers in AI Settings.';
    if (status === 0) return 'Could not connect to Velona. Check the backend network connection and try again.';
    return 'The Velona request failed. Please try again or switch providers in AI Settings.';
}

function isQuotaError(body) {
    const detail = [
        body?.error?.message,
        body?.error?.code,
        body?.error?.type,
        body?.message
    ].filter(Boolean).join(' ').toLowerCase();
    return /quota|insufficient|billing/.test(detail);
}

function retryAfterMs(value) {
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(value);
    return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function readUsage(body) {
    const usage = body?.usage || body?.data?.usage;
    if (!usage || typeof usage !== 'object') {
        return { inputTokens: 0, outputTokens: 0, totalTokens: 0, usageAvailable: false };
    }

    const hasInput = usage.prompt_tokens !== undefined || usage.input_tokens !== undefined;
    const hasOutput = usage.completion_tokens !== undefined || usage.output_tokens !== undefined;
    const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens) || 0;
    const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens) || 0;
    return {
        inputTokens,
        outputTokens,
        totalTokens: Number(usage.total_tokens) || inputTokens + outputTokens,
        usageAvailable: hasInput || hasOutput
    };
}

function textFromContent(content) {
    if (typeof content === 'string') return content;
    if (content && typeof content === 'object' && !Array.isArray(content)) {
        if (typeof content.text === 'string') return content.text;
        if (typeof content.content === 'string') return content.content;
        return '';
    }
    if (!Array.isArray(content)) return '';
    return content
        .map(part => {
            if (typeof part === 'string') return part;
            if (!part || typeof part !== 'object') return '';
            if (typeof part.text === 'string') return part.text;
            if (typeof part.content === 'string') return part.content;
            return '';
        })
        .filter(Boolean)
        .join('\n');
}

function getResponseMessage(body) {
    const choice = body?.choices?.[0];
    if (choice?.message && typeof choice.message === 'object') {
        return {
            message: {
                ...choice.message,
                content: textFromContent(choice.message.content)
            },
            shape: 'openai-chat-completion',
            finishReason: choice.finish_reason || null
        };
    }

    const nativeOutput = body?.data?.output ?? body?.output;
    if (typeof nativeOutput === 'string' || Array.isArray(nativeOutput)) {
        return {
            message: { role: 'assistant', content: textFromContent(nativeOutput) },
            shape: 'velona-inference-run',
            finishReason: body?.data?.finish || body?.finish || null
        };
    }

    return {
        message: null,
        shape: body?.data ? 'unknown-data-envelope' : 'unknown',
        finishReason: null
    };
}

function toOpenAIType(type) {
    const types = {
        OBJECT: 'object',
        ARRAY: 'array',
        STRING: 'string',
        NUMBER: 'number',
        INTEGER: 'integer',
        BOOLEAN: 'boolean'
    };
    return types[type] || String(type || 'string').toLowerCase();
}

function convertSchema(schema = {}) {
    const result = { type: toOpenAIType(schema.type) };
    if (schema.description) result.description = schema.description;
    if (Array.isArray(schema.enum)) result.enum = schema.enum;
    if (Array.isArray(schema.required)) result.required = schema.required;
    if (schema.properties) {
        result.properties = Object.fromEntries(
            Object.entries(schema.properties).map(([key, value]) => [key, convertSchema(value)])
        );
    }
    if (schema.items) result.items = convertSchema(schema.items);
    return result;
}

function convertTools(declarations = []) {
    return declarations.map(declaration => ({
        type: 'function',
        function: {
            name: declaration.name,
            description: declaration.description,
            parameters: convertSchema(declaration.parameters)
        }
    }));
}

function recordUsage(userId, data) {
    if (!userId) return Promise.resolve();
    const { usageAvailable, ...record } = data;
    return AIUsage.record({
        ...record,
        userId,
        provider: 'velona',
        model: AI_PRICING.velona.model,
        estimatedCostUsd: usageAvailable
            ? estimateCostUsd('velona', data.inputTokens || 0, data.outputTokens || 0)
            : null
    }).catch(error => {
        logAiEvent('ai-usage.record-failed', {
            provider: 'velona',
            errorCode: error.code || 'database_error'
        });
    });
}

function responseError(status, body) {
    const message = friendlyError(status, body);
    return new AIProviderError(status, message, `http_${status}`);
}

function safeProviderErrorCode(body) {
    const code = body?.error?.code || body?.code;
    return typeof code === 'string' && /^[a-z0-9_-]{1,48}$/i.test(code)
        ? code
        : 'provider_error';
}

async function request({ feature, messages, tools, json = false, temperature = 0.2, maxOutputTokens = 4096, userId }) {
    const apiKey = process.env.VELONA_API_KEY;
    if (!apiKey || !apiKey.trim()) {
        throw new AIProviderError(503, 'Velona is not configured. Add VELONA_API_KEY to the backend .env file.');
    }
    if (Date.now() < serviceState.unavailableUntil) {
        throw new AIProviderError(503, 'Velona is temporarily unavailable after repeated service errors. Try again later or switch providers in AI Settings.');
    }

    const payload = {
        model: AI_PRICING.velona.model,
        messages,
        temperature,
        max_tokens: maxOutputTokens
    };
    if (json) payload.response_format = { type: 'json_object' };
    if (tools?.length) payload.tools = convertTools(tools);
    const imageParts = messages.flatMap(message => (
        Array.isArray(message.content)
            ? message.content.filter(part => part?.type === 'image_url')
            : []
    ));
    logAiEvent('velona.request', {
        feature,
        endpoint: 'openai-chat-completions',
        model: AI_PRICING.velona.model,
        imageCount: imageParts.length,
        imageMimeTypes: imageParts.map(part => (
            /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(part.image_url?.url || '')?.[1] || 'unknown'
        ))
    });

    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const startedAt = Date.now();
        let response;
        let body = {};
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
            try {
                response = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timeout);
            }

            const responseText = await response.text();
            try {
                body = responseText ? JSON.parse(responseText) : null;
            } catch {
                body = null;
            }
            const durationMs = Date.now() - startedAt;
            const { inputTokens, outputTokens, totalTokens, usageAvailable } = readUsage(body);

            if (!response.ok) {
                logAiEvent('velona.failure', {
                    feature,
                    statusCode: response.status,
                    responseShape: body?.error ? 'openai-error' : body?.data ? 'native-error-envelope' : 'unknown',
                    errorCode: safeProviderErrorCode(body),
                    durationMs
                });
                const error = responseError(response.status, body);
                await recordUsage(userId, {
                    feature,
                    inputTokens,
                    outputTokens,
                    totalTokens,
                    durationMs,
                    statusCode: response.status,
                    usageAvailable
                });

                const retryable = response.status === 408 ||
                    (response.status === 429 && !isQuotaError(body)) ||
                    [500, 502, 503, 504].includes(response.status);
                const retryAfter = retryAfterMs(response.headers.get('retry-after'));
                const retryDelay = retryAfter ?? Math.min(1000 * (2 ** attempt), MAX_RETRY_WAIT_MS);
                if (!retryable || attempt === MAX_RETRIES ||
                    (retryAfter !== null && retryAfter > MAX_RETRY_WAIT_MS)) {
                    if (response.status === 503) {
                        serviceState.consecutive503s += 1;
                        if (serviceState.consecutive503s >= 2) {
                            serviceState.unavailableUntil = Date.now() + 30_000;
                        }
                    }
                    throw error;
                }

                if (response.status === 503) {
                    serviceState.consecutive503s += 1;
                    if (serviceState.consecutive503s >= 2) {
                        serviceState.unavailableUntil = Date.now() + 30_000;
                        throw error;
                    }
                } else if (response.status < 500 && response.status !== 429 && response.status !== 408) {
                    throw error;
                } else {
                    serviceState.consecutive503s = 0;
                }

                await new Promise(resolve => setTimeout(
                    resolve,
                    retryDelay
                ));
                lastError = error;
                continue;
            }

            serviceState.consecutive503s = 0;
            serviceState.unavailableUntil = 0;
            if (!body || typeof body !== 'object') {
                logAiEvent('velona.invalid-response', {
                    feature,
                    statusCode: response.status,
                    responseBytes: Buffer.byteLength(responseText || ''),
                    contentType: response.headers.get('content-type') || 'unknown',
                    durationMs
                });
                await recordUsage(userId, {
                    feature, durationMs, statusCode: response.status,
                    inputTokens, outputTokens, totalTokens, usageAvailable
                });
                throw new AIProviderError(502, 'Velona returned an unreadable response. Please retry.', 'invalid_response');
            }

            const { message, shape, finishReason } = getResponseMessage(body);
            if (feature === 'receipt-scan' && String(finishReason).toLowerCase() === 'length') {
                logAiEvent('velona.truncated-response', {
                    feature,
                    statusCode: response.status,
                    responseShape: shape,
                    finishReason,
                    inputTokens,
                    outputTokens,
                    durationMs
                });
                await recordUsage(userId, {
                    feature, inputTokens, outputTokens, totalTokens, durationMs, statusCode: 200,
                    usageAvailable
                });
                throw new AIProviderError(
                    502,
                    'Velona truncated the receipt response at the output token limit. Please retry the scan.',
                    'output_truncated'
                );
            }
            if (!message || (!message.content && !message.tool_calls?.length)) {
                logAiEvent('velona.empty-response', {
                    feature,
                    statusCode: response.status,
                    responseShape: shape,
                    responseKeys: Object.keys(body).slice(0, 12),
                    choiceCount: Array.isArray(body.choices) ? body.choices.length : null,
                    finishReason,
                    outputType: typeof (body?.data?.output ?? body?.output),
                    hasUsage: usageAvailable,
                    durationMs
                });
                const error = new AIProviderError(
                    502,
                    finishReason === 'length'
                        ? 'Velona truncated the receipt response before returning results. Please retry.'
                        : 'Velona returned no text for this request. Please retry or use Gemini in AI Settings.',
                    'empty_response'
                );
                await recordUsage(userId, {
                    feature, inputTokens, outputTokens, totalTokens, durationMs, statusCode: 200,
                    usageAvailable
                });
                throw error;
            }
            if (message.tool_calls && message.tool_calls.some(call =>
                call?.type !== 'function' || !call.id || !call.function?.name ||
                typeof call.function.arguments !== 'string'
            )) {
                const error = new AIProviderError(502, 'Velona returned an invalid tool call. Please retry.');
                await recordUsage(userId, {
                    feature, inputTokens, outputTokens, totalTokens, durationMs, statusCode: 200,
                    usageAvailable
                });
                throw error;
            }

            await recordUsage(userId, {
                feature, inputTokens, outputTokens, totalTokens, durationMs, statusCode: response.status,
                usageAvailable
            });
            logAiEvent('velona.success', {
                feature,
                statusCode: response.status,
                responseShape: shape,
                finishReason,
                inputTokens,
                outputTokens,
                durationMs
            });
            return message;
        } catch (error) {
            if (error instanceof AIProviderError) throw error;
            const durationMs = Date.now() - startedAt;
            const timedOut = error.name === 'AbortError';
            const mapped = new AIProviderError(
                timedOut ? 408 : 503,
                friendlyError(timedOut ? 408 : 0),
                timedOut ? 'timeout' : 'network_error'
            );
            await recordUsage(userId, {
                feature, durationMs, statusCode: timedOut ? 408 : null
            });
            lastError = mapped;
            if (attempt === MAX_RETRIES) throw mapped;
            await new Promise(resolve => setTimeout(resolve, Math.min(1000 * (2 ** attempt), MAX_RETRY_WAIT_MS)));
        }
    }

    throw lastError || new AIProviderError(503, 'The Velona request failed. Please try again.');
}

function asMessages(systemPrompt, contents) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push(...contents);
    return messages;
}

function imageDataUrl(data, mimeType) {
    if (Buffer.byteLength(data, 'base64') > MAX_IMAGE_BYTES) {
        throw new AIProviderError(413, 'Receipt image exceeds the 8 MB Velona limit. Select a smaller image.');
    }
    if (!/^image\/[a-z0-9.+-]+$/i.test(mimeType)) {
        throw new AIProviderError(422, 'The receipt image type is not supported.');
    }
    return `data:${mimeType};base64,${data}`;
}

const VelonaAdapter = {
    model: AI_PRICING.velona.model,
    AIProviderError,
    getConfig() {
        return {
            configured: Boolean(process.env.VELONA_API_KEY?.trim()),
            model: AI_PRICING.velona.model
        };
    },

    async completeText({ systemPrompt, userPrompt, feature, userId, maxOutputTokens = 4096, temperature = 0.7 }) {
        const message = await request({
            feature,
            userId,
            messages: asMessages(systemPrompt, [{ role: 'user', content: userPrompt }]),
            temperature,
            maxOutputTokens
        });
        return typeof message.content === 'string' ? message.content : '';
    },

    async completeJson({
        systemPrompt,
        contents,
        feature,
        userId,
        temperature = 0.2,
        maxOutputTokens = 4096
    }) {
        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        for (const content of contents) {
            const parts = content.parts || [];
            if (parts.some(part => part.inlineData)) {
                const image = parts.find(part => part.inlineData).inlineData;
                const text = parts.filter(part => part.text).map(part => part.text).join('\n');
                messages.push({
                    role: content.role === 'model' ? 'assistant' : 'user',
                    content: [
                        { type: 'text', text },
                        { type: 'image_url', image_url: { url: imageDataUrl(image.data, image.mimeType) } }
                    ]
                });
            } else {
                messages.push({
                    role: content.role === 'model' ? 'assistant' : 'user',
                    content: parts.map(part => part.text || '').join('\n')
                });
            }
        }
        const message = await request({
            feature, userId, messages, json: true, temperature, maxOutputTokens
        });
        return typeof message.content === 'string' ? message.content : '';
    },

    async completeWithTools({
        systemPrompt,
        userPrompt,
        userId,
        feature,
        declarations,
        executeTool,
        maxTurns = 5,
        conversationHistory = []
    }) {
        const groundedSystemPrompt = `${systemPrompt}

Grounding requirements: Never invent financial figures or substitute guesses for database results. Use exact values returned by the financial tools. If a tool fails or does not return the requested data, clearly say that the data is unavailable.`;
        const messages = asMessages(groundedSystemPrompt, [
            ...conversationHistory.map(message => ({
                role: message.role,
                content: message.content
            })),
            { role: 'user', content: userPrompt }
        ]);
        for (let turn = 0; turn < maxTurns; turn++) {
            const assistant = await request({
                feature, userId, messages, tools: declarations, temperature: 0.7
            });
            if (!assistant.tool_calls?.length) {
                if (typeof assistant.content !== 'string' || !assistant.content.trim()) {
                    throw new AIProviderError(502, 'Velona returned an empty final answer. Please retry.');
                }
                return assistant.content;
            }

            messages.push({
                role: 'assistant',
                content: assistant.content || null,
                tool_calls: assistant.tool_calls
            });
            for (const call of assistant.tool_calls) {
                let result;
                try {
                    const args = JSON.parse(call.function.arguments);
                    if (!args || typeof args !== 'object' || Array.isArray(args)) {
                        throw new Error('Tool arguments must be a JSON object.');
                    }
                    result = await executeTool(call.function.name, args, userId);
                } catch (error) {
                    result = { error: error.message || 'Tool call could not be completed.' };
                }
                messages.push({
                    role: 'tool',
                    tool_call_id: call.id,
                    content: JSON.stringify(result)
                });
            }
        }
        throw new AIProviderError(502, 'The advisor exceeded its tool-call limit before finishing. Please ask again.');
    }
};

module.exports = VelonaAdapter;
