/**
 * AI Service Layer
 * Routes AI features through the selected provider while preserving Gemini.
 * - Prompt generation
 * - Response caching
 * - Rate limit handling with exponential backoff
 * 
 * IMPORTANT: Gemini NEVER receives raw transaction data.
 * Only processed summaries are sent.
 */
const { GoogleGenAI } = require('@google/genai');
const AIInsightsCache = require('../models/AIInsightsCache');
const AIContentCache = require('../models/AIContentCache');
const AIUsage = require('../models/AIUsage');
const { AI_PRICING, estimateCostUsd } = require('../config/aiPricing');
const { getDefaultModel } = require('../config/aiModels');
const VelonaAdapter = require('./velonaAdapter');
const DataProcessingService = require('./dataProcessingService');
const { logAiEvent, logAiEventThrottled, shortHash } = require('../utils/aiLogger');
const {
    normalizeReceiptResult,
    normalizeSmsParse,
    normalizeSmsContent,
    isExcludedSmsBody,
    redactSmsBody,
    maskSender,
    dateToLocalYmd
} = require('../utils/financeParsers');
const {
    TOOL_DECLARATIONS,
    executeToolCall,
    buildUserIndex,
    buildAdvisorSystemPrompt
} = require('./aiTools');

// Multi-key rotation system
const apiKeys = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5
].filter(key => key && key !== 'YOUR_EXTRA_KEY_HERE');

let currentKeyIndex = 0;
let ai = null;

// Log initialization status
console.log(`[AI SERVICE] Detected ${apiKeys.length} active API keys for rotation.`);
if (apiKeys.length === 0) {
    console.warn('[AI SERVICE] CRITICAL: No Gemini API keys found. Please check your .env file.');
}

/** Get or initialize the Gemini client with the current key */
const getAI = () => {
    if (!ai) {
        if (apiKeys.length === 0) {
            throw new Error('No valid Gemini API keys found in .env');
        }
        const currentKey = apiKeys[currentKeyIndex];
        ai = new GoogleGenAI({ apiKey: currentKey });
        console.log(`[AI SERVICE] Initialized with key #${currentKeyIndex + 1}`);
    }
    return ai;
};

/** Switch to the next available API key and re-initialize the client */
const rotateKey = () => {
    if (apiKeys.length <= 1) return false;

    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
    ai = null; // Reset client to force re-initialization with new key
    console.log(`[AI SERVICE] Rotating to key #${currentKeyIndex + 1}`);
    return true;
};

/** Active Gemini client keyed by API key (env rotation + optional personal key) */
const clientCache = new Map();

/** Get the Gemini client for an optional personal (user-supplied) API key */
const getAIFor = (personalKey) => {
    if (personalKey) {
        if (!clientCache.has(personalKey)) {
            clientCache.set(personalKey, new GoogleGenAI({ apiKey: personalKey }));
        }
        return clientCache.get(personalKey);
    }
    return getAI();
};

/** Rotate to the next env key; personal keys have no rotation (single key) */
const rotateKeyFor = (personalKey) => {
    if (personalKey) return false;
    return rotateKey();
};

const MODEL = AI_PRICING.gemini.model;
const PROVIDER_PROMPT_VERSION = 1;

const RECEIPT_CACHE_FEATURE = 'receipt_scan';
const SMS_CACHE_FEATURE = 'sms_parse';
const RECEIPT_PROMPT_VERSION = 3;
const SMS_PROMPT_VERSION = 2;
const SMS_CHUNK_SIZE = 15;
const inFlightAiRequests = new Map();

/** Collapse concurrent identical AI requests into a single Gemini call. */
function runDeduped(key, task) {
    if (!key) return task();

    if (inFlightAiRequests.has(key)) {
        logAiEvent('ai-cache.in-flight', { key: shortHash(key) });
        return inFlightAiRequests.get(key);
    }

    const promise = Promise.resolve().then(task);
    const tracked = promise.finally(() => {
        if (inFlightAiRequests.get(key) === tracked) {
            inFlightAiRequests.delete(key);
        }
    });

    inFlightAiRequests.set(key, tracked);
    return tracked;
}

function buildParamsHash(feature, params) {
    return AIContentCache.hash(AIContentCache.stableStringify({
        cacheVersion: AIContentCache.CACHE_VERSION,
        feature,
        ...params
    }));
}

function parseJsonText(text, fallback = null) {
    if (!text || !String(text).trim()) return fallback;
    try {
        return JSON.parse(text);
    } catch (_) {
        const cleaned = String(text)
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .trim();
        try {
            return JSON.parse(cleaned);
        } catch (_) {
            return fallback;
        }
    }
}

function getModelFor(provider, feature, selectedModel = null) {
    if (provider === 'velona') return selectedModel || getDefaultModel(feature);
    if (provider === 'gemini') return MODEL;
    throw new Error('Unsupported AI provider selected.');
}

function providerPromptHash(provider, prompt, feature, model = null) {
    return AIInsightsCache.hash(JSON.stringify({
        provider,
        model: getModelFor(provider, feature, model),
        promptVersion: PROVIDER_PROMPT_VERSION,
        prompt
    }));
}

async function recordAIUsage(data) {
    try {
        await AIUsage.record({
            ...data,
            estimatedCostUsd: estimateCostUsd(
                data.provider,
                data.inputTokens || 0,
                data.outputTokens || 0
            )
        });
    } catch (error) {
        logAiEvent('ai-usage.record-failed', {
            provider: data.provider,
            errorCode: error.code || 'database_error'
        });
    }
}

function getGeminiTokenUsage(response) {
    const usage = response?.usageMetadata || {};
    const inputTokens = usage.promptTokenCount || 0;
    const outputTokens = usage.candidatesTokenCount || 0;
    return {
        inputTokens,
        outputTokens,
        totalTokens: usage.totalTokenCount || inputTokens + outputTokens
    };
}

async function recordCacheHit(userId, provider, feature, model = null) {
    await recordAIUsage({
        userId,
        provider,
        model: getModelFor(provider, feature, model),
        feature,
        statusCode: null,
        cacheHit: true
    });
}

async function callProviderText(provider, options) {
    if (provider === 'gemini') {
        return callGeminiWithRetry(
            options.systemPrompt,
            options.userPrompt,
            options.maxRetries ?? 3,
            options.personalKey,
            options.userId,
            options.feature
        );
    }
    return VelonaAdapter.completeText(options);
}

async function callProviderJson(provider, options) {
    if (provider === 'gemini') {
        return callGeminiJson({ ...options, userId: options.userId });
    }

    for (let attempt = 0; attempt < 2; attempt++) {
        const text = await VelonaAdapter.completeJson(options);
        try {
            return options.parse ? options.parse(text) : text;
        } catch {
            logAiEvent('velona.structured-response-invalid', {
                feature: options.feature,
                attempt: attempt + 1
            });
            if (attempt === 1) break;
        }
    }
    throw new VelonaAdapter.AIProviderError(
        502,
        `Velona returned invalid structured data for ${options.feature}. Please retry.`,
        'invalid_json'
    );
}

async function callProviderTools(provider, options) {
    if (provider === 'gemini') {
        return callGeminiWithTools(
            options.systemPrompt,
            options.userPrompt,
            options.userId,
            options.maxTurns,
            options.personalKey,
            options.conversationHistory
        );
    }
    return VelonaAdapter.completeWithTools({
        ...options,
        declarations: TOOL_DECLARATIONS,
        executeTool: executeToolCall
    });
}

/**
 * Call Gemini for a JSON response with key rotation, retry logging and
 * validation. `parse` may throw to trigger a malformed-response retry.
 */
async function callGeminiJson({
    feature,
    contents,
    systemPrompt = null,
    personalKey = null,
    maxRetries = 3,
    temperature = 0.2,
    parse = null,
    userId = null
}) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const genai = getAIFor(personalKey);
        const startedAt = Date.now();

        logAiEvent('gemini.request', {
            feature,
            model: MODEL,
            attempt: attempt + 1
        });

        try {
            const response = await genai.models.generateContent({
                model: MODEL,
                contents,
                config: {
                    ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
                    responseMimeType: 'application/json',
                    temperature
                }
            });

            let result = response.text;
            if (parse) {
                try {
                    result = parse(response.text);
                } catch {
                    logAiEvent('gemini.failure', {
                        feature,
                        durationMs: Date.now() - startedAt,
                        status: 'malformed-response',
                        attempt: attempt + 1
                    });
                    await recordAIUsage({
                        userId,
                        provider: 'gemini',
                        model: MODEL,
                        feature,
                        ...getGeminiTokenUsage(response),
                        durationMs: Date.now() - startedAt,
                        statusCode: 200
                    });

                    if (attempt < maxRetries) {
                        logAiEvent('gemini.retry', {
                            feature,
                            reason: 'malformed-response',
                            attempt: attempt + 1
                        });
                        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                        continue;
                    }

                    break;
                }
            }

            logAiEvent('gemini.success', {
                feature,
                durationMs: Date.now() - startedAt,
                attempt: attempt + 1
            });
            await recordAIUsage({
                userId,
                provider: 'gemini',
                model: MODEL,
                feature,
                ...getGeminiTokenUsage(response),
                durationMs: Date.now() - startedAt,
                statusCode: 200
            });

            return result;
        } catch (error) {
            const status = error.status || error.statusCode || error.code || 'unknown';

            logAiEvent('gemini.failure', {
                feature,
                durationMs: Date.now() - startedAt,
                status: String(status),
                attempt: attempt + 1
            });
            await recordAIUsage({
                userId,
                provider: 'gemini',
                model: MODEL,
                feature,
                durationMs: Date.now() - startedAt,
                statusCode: Number.isInteger(Number(status)) ? Number(status) : null
            });

            const rateLimited = status === 429 || error.message?.includes('429');
            const serverError = status === 500 || status === 503;

            if (rateLimited || serverError) {
                if (rateLimited && rotateKeyFor(personalKey)) {
                    logAiEvent('gemini.retry', {
                        feature,
                        reason: 'key-rotation',
                        status: String(status),
                        attempt: attempt + 1
                    });
                    continue;
                }

                const waitMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                logAiEvent('gemini.retry', {
                    feature,
                    reason: 'backoff',
                    status: String(status),
                    waitMs: Math.round(waitMs),
                    attempt: attempt + 1
                });
                await new Promise(resolve => setTimeout(resolve, waitMs));
                continue;
            }

            break;
        }
    }

    const error = new Error(
        `${feature} Gemini request failed. Check Gemini configuration and try again.`
    );
    error.statusCode = 503;
    throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ANALYSIS SYSTEM PROMPT
 *
 * The persona is a direct, empathetic Indian personal finance mentor — someone
 * who knows the user's complete financial history and talks to them like a
 * trusted elder sibling who happens to be a finance expert.
 *
 * Tone goals:
 *  - Conversational, not corporate
 *  - Specific numbers, not generic observations
 *  - Always compare current behavior to the user's OWN historical baseline
 *  - Point out the one or two biggest problems first, not a laundry list
 *  - End with one clear, actionable next step
 */
const ANALYSIS_SYSTEM_PROMPT = `You are an elite, direct Personal Financial Advisor for an Indian user. You have analyzed their spending history and baseline across multiple months.

CORE PRINCIPLES:
1. **Dynamic & Authentic**: Provide advice tailored to this user's exact numbers and anomalies. Do NOT recite generic slogans, repetitive mantras, or canned speeches.
2. **Real Solutions, Not Vague Suggestions**: Never say "continue to monitor" or "consider setting a budget". Prescribe specific, calculated targets in Rupees (₹) with estimated savings impact.
3. **Structured & Scannable**:
   - Avoid long essay paragraphs or walls of text.
   - Use headings (\`###\` or \`####\`) to separate major points.
   - Summarize key financial metrics with piped stats (e.g. **Income:** ₹X | **Spent:** ₹Y | **Saved:** ₹Z) so they display as clean cards.
   - Use bullet points (\`*\` or \`-\`) with relevant icons (🚨 for high-risk drains, ⚠️ for warnings, ✅ for wins).
   - Use numbered action steps (\`1.\`, \`2.\`, \`3.\`) for concrete fixes tailored to their primary financial challenges.
   - Use \`💡\` for key takeaways and \`🎯\` for targets.
- All amounts in Indian Rupees (₹).`;

/**
 * ANALYSIS USER PROMPT
 * Takes the pre-computed dense context block from dataProcessingService
 * and asks the model to deliver a tailored, scannable advisor review.
 */
const ANALYSIS_USER_PROMPT = (contextBlock) => `${contextBlock}

Based on the above financial data, provide a structured, scannable personal financial advisor analysis. Identify their biggest anomalies, give a clear breakdown, and prescribe 2-3 concrete numbered solutions with exact numbers. Do not use generic filler.`;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * CHAT SYSTEM PROMPT
 *
 * For back-and-forth chat, the advisor has the same persona but is more
 * responsive to the specific question asked. It always grounds answers in
 * the user's actual data rather than generic advice.
 */
const CHAT_SYSTEM_PROMPT = `You are a knowledgeable, direct personal finance advisor for an Indian user. You have their complete financial data (income, monthly spending by category, historical baselines, budget status, micro-spending patterns) provided below.

YOUR JOB:
- Answer the user's specific question using their actual numbers
- Compare current behavior to their own historical baseline whenever relevant
- Be conversational, not robotic — talk like a knowledgeable friend, not a finance textbook
- If they ask "can I afford X?", look at their remaining budget, savings rate, and spending velocity before answering
- If they ask about a category, tell them how it compares to their historical average
- Be honest. If their finances look risky, say so clearly with the specific numbers
- All amounts in Indian Rupees (₹)
- Keep responses focused — 1–3 paragraphs maximum for most questions`;

/**
 * CHAT USER PROMPT
 * Injects context and the user's question.
 */
const CHAT_USER_PROMPT = (contextBlock, userMessage) => `[FINANCIAL CONTEXT]
${contextBlock}

[USER'S QUESTION]
${userMessage}

Answer this question directly using their financial data above. Be specific with numbers. 1–3 paragraphs.`;

const AIService = {
    /**
     * Public (non-secret) provider configuration for the client UI.
     */
    getConfig() {
        return {
            activeProvider: 'velona',
            velona: VelonaAdapter.getConfig(),
            gemini: {
                configured: apiKeys.length > 0,
                keyCount: apiKeys.length,
                model: MODEL
            },
            pricing: AI_PRICING,
            mode: 'backend'
        };
    },
    getVelonaModels(options) {
        return VelonaAdapter.getModels(options);
    },

    /**
     * Generate financial analysis using the selected provider
     * Checks cache first, only calls API if needed
     * @param {number} userId
     * @param {string} month - Format: YYYY-MM
     * @returns {object} { analysis, cached, summary }
     */
    async generateAnalysis(userId, month = null, refresh = false, timeframe = 'month', personalKey = null, provider = 'velona', model = null) {
        // Step 1: Generate processed financial summary with delta matrix
        const summary = await DataProcessingService.generateFinancialSummary(
            userId, month, 'All', timeframe
        );

        // Step 2: Build ultra-dense, human-advisor context block
        const summaryText = DataProcessingService.formatForHumanAdvisorPrompt(summary);
        const dataHash    = DataProcessingService.hashSummary(summary);

        // Step 3: Build the prompt
        const prompt     = ANALYSIS_USER_PROMPT(summaryText);
        const promptHash = providerPromptHash(provider, prompt, 'analysis', model);

        // Step 4: Check cache (skip if refresh is true)
        if (!refresh) {
            const cached = await AIInsightsCache.findValid(userId, 'analysis', promptHash, dataHash);
            if (cached) {
                await recordCacheHit(userId, provider, 'analysis', model);
                return {
                    analysis:     cached.response,
                    cached:       true,
                    summary,
                    healthSignal: summary.healthSignal
                };
            }
        }

        // Step 5: Call the selected provider
        console.log(`[AI SERVICE] Starting analysis for user ${userId} (${timeframe})...`);
        const response = await callProviderText(provider, {
            systemPrompt: ANALYSIS_SYSTEM_PROMPT,
            userPrompt: prompt,
            maxRetries: 3,
            personalKey,
            userId,
            feature: 'analysis',
            model
        });

        // Step 6: Cache the response (24 hour TTL)
        await AIInsightsCache.save({
            userId,
            type:             'analysis',
            promptHash,
            response,
            dataSnapshotHash: dataHash,
            ttlHours:         24
        });

        return {
            analysis:     response,
            cached:       false,
            summary,
            healthSignal: summary.healthSignal
        };
    },

    /**
     * Handle chat messages with financial context
     * @param {number} userId
     * @param {string} userMessage - User's question
     * @param {string} month - Format: YYYY-MM (optional)
     * @param {string} timeframe - 'Today', 'This Week', 'This Month', 'All'
     * @returns {object} { reply, summary }
     */
    /**
     * Handle chat messages with full on-demand tool access.
     * The advisor is not bound to a pre-defined snapshot:
     * The selected provider can call tools to query any period, category, or trend across the DB.
     *
     * @param {number} userId
     * @param {string} userMessage - User's question
     * @param {string|null} month  - Format: YYYY-MM (optional baseline context)
     * @param {string} timeframe   - 'Today', 'This Week', 'This Month', 'All'
     * @returns {object} { reply, cached }
     */
    async chat(userId, userMessage, month = null, timeframe = 'All', personalKey = null, provider = 'velona', conversationHistory = [], model = null) {
        // Step 1: Build the user orientation index & advisor system prompt
        const userIndex = await buildUserIndex(userId);
        const systemPrompt = buildAdvisorSystemPrompt(userIndex);

        // Step 2: Build baseline current-period context
        const summary = await DataProcessingService.generateFinancialSummary(userId, month, timeframe);
        const baselineContext = DataProcessingService.formatForHumanAdvisorPrompt(summary);

        const fullUserPrompt = `[CURRENT PERIOD CONTEXT]\n${baselineContext}\n\n[USER QUESTION]\n${userMessage}`;

        const dataHash = DataProcessingService.hashSummary(summary);
        const promptHash = providerPromptHash(provider, {
            prompt: fullUserPrompt,
            history: conversationHistory
        }, 'chat', model);

        // Step 3: Check cache (1 hour TTL for chat)
        const cached = await AIInsightsCache.findValid(userId, 'chat', promptHash, dataHash);
        if (cached) {
            await recordCacheHit(userId, provider, 'chat', model);
            return {
                reply: cached.response,
                cached: true
            };
        }

        // Step 4: Call the selected provider with full function-calling capabilities
        console.log(`[AI SERVICE] Starting tool-enabled chat for user ${userId}: "${userMessage.slice(0, 60)}..."`);
        const reply = await callProviderTools(provider, {
            systemPrompt,
            userPrompt: fullUserPrompt,
            userId,
            maxTurns: 5,
            personalKey,
            conversationHistory,
            feature: 'chat',
            model
        });

        // Step 5: Cache response
        await AIInsightsCache.save({
            userId,
            type: 'chat',
            promptHash,
            response: reply,
            dataSnapshotHash: dataHash,
            ttlHours: 1
        });

        return {
            reply,
            cached: false
        };
    },

    /**
     * Scan and extract structured financial data from a bill / receipt image.
     * Uses the selected provider's vision adapter with a persistent content-hash cache.
     *
     * @param {string} base64Data  - Base64 encoded image string
     * @param {string} mimeType    - e.g. 'image/jpeg', 'image/png', 'image/webp'
     * @param {Array<string>} userCategories - List of user's valid category names
     * @param {string|null} personalKey - Optional user-supplied Gemini key
     * @param {object} options - { userId, refresh }
     * @returns {Promise<object>} Structured receipt data
     */
    async scanReceiptImage(base64Data, mimeType = 'image/jpeg', userCategories = [], personalKey = null, options = {}) {
        const userId = options.userId || null;
        const refresh = Boolean(options.refresh);
        const provider = options.provider || 'velona';
        const model = options.model || null;

        const cleanBase64 = String(base64Data || '').replace(/^data:[^;]+;base64,/, '');
        const imageBytes = Buffer.from(cleanBase64, 'base64');
        if (imageBytes.length === 0) {
            throw new Error('Image data is empty or invalid.');
        }

        const normalizedMime = String(mimeType || 'image/jpeg').toLowerCase();
        const categoryNames = (Array.isArray(userCategories) ? userCategories : [])
            .filter(name => typeof name === 'string' && name.trim());
        const validCategories = categoryNames.length > 0
            ? categoryNames.join(', ')
            : 'Food, Groceries, Shopping, Utilities, Health, Education, Entertainment, Travel, Rent, Others';

        const contentHash = AIContentCache.hash(imageBytes);
        const cacheParams = {
            promptVersion: RECEIPT_PROMPT_VERSION,
            provider,
            model: getModelFor(provider, 'receipt-scan', model),
            fallbackModels: [],
            mimeType: normalizedMime,
            categories: categoryNames
        };
        const paramsHash = buildParamsHash(RECEIPT_CACHE_FEATURE, cacheParams);
        const cacheKey = userId
            ? `${userId}:${RECEIPT_CACHE_FEATURE}:${AIContentCache.CACHE_VERSION}:${contentHash}:${paramsHash}`
            : null;

        if (refresh) {
            logAiEvent('receipt-scan.refresh', { cacheBypassed: true, hash: shortHash(contentHash) });
        } else if (userId) {
            const cached = await AIContentCache.find({
                userId,
                feature: RECEIPT_CACHE_FEATURE,
                contentHash,
                paramsHash
            });

            if (cached) {
                await recordCacheHit(userId, provider, 'receipt_scan', model);
                logAiEventThrottled(
                    'receipt-scan.cache-hit',
                    { user: `u${userId}`, hash: shortHash(contentHash) },
                    `receipt:${userId}:${contentHash}`
                );
                return { ...cached, cached: true };
            }

            logAiEvent('receipt-scan.cache-miss', {
                user: `u${userId}`,
                hash: shortHash(contentHash)
            });
        }

        const prompt = `You are an OCR receipt parser for an Indian personal finance system. Read the receipt image and return one concise, valid JSON object with exactly these fields:
1. "merchant": The name of the store, vendor, shop, hospital, or company (e.g. "D-Mart", "Apollo Pharmacy", "Swiggy", "Indian Oil", "More Supermarket"). If unknown, use "Local Store".
2. "totalAmount": The final total amount paid in Rupees as a number (e.g. 1450.50). Do not include currency symbols.
3. "billDate": The date printed on the bill in exact "YYYY-MM-DD" format.
   - If the year is 2 digits (e.g. 26 or 25), convert to 4 digits (e.g. 2026).
   - If the date is missing, blurry, or cannot be determined with certainty, set "billDate" to null.
4. "dateDetected": true if a date was found on the bill, false if null.
5. "primaryCategory": The single best category matching one of: [${validCategories}].
6. "summary": A brief 1-sentence description of what this bill is for (e.g. "Weekly groceries at D-Mart").
7. "items": An array of at most 15 clearly legible line items. For each item:
   - "name": Item description (e.g. "Sunflower Oil 1L")
   - "amount": Price in Rupees (number)
   - "category": Best category from [${validCategories}]
   If line items are not distinguishable, return an empty array []. If there are more than 15, include only the clearest items; do not omit or estimate the merchant, final total, date, or primary category.

Return only the JSON object. Do not include markdown, explanations, or extra fields. Keep text values brief.`;

        const executeScan = async () => {
            const parsed = await callProviderJson(provider, {
                feature: 'receipt-scan',
                model,
                personalKey,
                userId,
                temperature: 0.2,
                maxOutputTokens: 8192,
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                inlineData: {
                                    data: cleanBase64,
                                    mimeType: normalizedMime
                                }
                            },
                            { text: prompt }
                        ]
                    }
                ],
                parse: (text) => {
                    const value = parseJsonText(text, null);
                    if (!value || typeof value !== 'object' || Array.isArray(value)) {
                        throw new Error('The selected AI provider returned an unreadable receipt response.');
                    }
                    return value;
                }
            });

            const normalized = normalizeReceiptResult(parsed, categoryNames);

            if (normalized.totalAmount <= 0 && normalized.items.length === 0) {
                throw new Error('The selected AI provider could not read a usable total or line items from this image.');
            }

            if (userId) {
                const updated = await AIContentCache.upsert({
                    userId,
                    feature: RECEIPT_CACHE_FEATURE,
                    contentHash,
                    paramsHash,
                    response: normalized
                });

                logAiEvent(updated ? 'receipt-scan.cache-updated' : 'receipt-scan.cache-saved', {
                    items: normalized.items.length,
                    hash: shortHash(contentHash)
                });
            }

            return { ...normalized, cached: false };
        };

        const dedupeKey = cacheKey
            ? `${cacheKey}:${refresh ? 'refresh' : 'normal'}`
            : null;

        return runDeduped(dedupeKey, executeScan);
    },

    /**
     * Parse a batch of bank/UPI SMS messages into structured debit transactions.
     * Uses a normalized content-hash cache scoped to the authenticated user.
     *
     * @param {Array<object>} messages - [{ id, body, date, address }]
     * @param {Array<string>} userCategories - Valid category names
     * @param {string|null} personalKey
     * @param {object} options - { userId, refresh }
     * @returns {Promise<object>} { transactions, cached }
     */
    async parseSmsMessages(messages = [], userCategories = [], personalKey = null, options = {}) {
        const userId = options.userId || null;
        const refresh = Boolean(options.refresh);
        const provider = options.provider || 'velona';
        const model = options.model || null;

        const candidates = (Array.isArray(messages) ? messages : [])
            .filter(message => message && message.body && !isExcludedSmsBody(message.body))
            .slice(0, 60);

        if (candidates.length === 0) {
            return { transactions: [], cached: false };
        }

        const categoryNames = (Array.isArray(userCategories) ? userCategories : [])
            .filter(name => typeof name === 'string' && name.trim());
        const validCategories = categoryNames.length > 0
            ? categoryNames.join(', ')
            : 'Food, Groceries, Shopping, Utilities, Health, Education, Entertainment, Travel, Rent, Others';

        const contentHash = AIContentCache.hash(
            AIContentCache.stableStringify(normalizeSmsContent(candidates))
        );
        const cacheParams = {
            promptVersion: SMS_PROMPT_VERSION,
            provider,
            model: getModelFor(provider, 'sms-parse', model),
            fallbackModels: [],
            categories: categoryNames,
            chunkSize: SMS_CHUNK_SIZE
        };
        const paramsHash = buildParamsHash(SMS_CACHE_FEATURE, cacheParams);
        const cacheKey = userId
            ? `${userId}:${SMS_CACHE_FEATURE}:${AIContentCache.CACHE_VERSION}:${contentHash}:${paramsHash}`
            : null;

        if (refresh) {
            logAiEvent('sms-parse.refresh', { cacheBypassed: true, hash: shortHash(contentHash) });
        } else if (userId) {
            const cached = await AIContentCache.find({
                userId,
                feature: SMS_CACHE_FEATURE,
                contentHash,
                paramsHash
            });

            if (Array.isArray(cached)) {
                await recordCacheHit(userId, provider, 'sms_parse', model);
                logAiEventThrottled(
                    'sms-parse.cache-hit',
                    {
                        user: `u${userId}`,
                        hash: shortHash(contentHash),
                        transactions: cached.length
                    },
                    `sms:${userId}:${contentHash}`
                );
                return { transactions: cached, cached: true };
            }

            logAiEvent('sms-parse.cache-miss', {
                user: `u${userId}`,
                hash: shortHash(contentHash)
            });
        }

        const buildPrompt = (smsData) => `You are a strict financial NLP parser for Indian banking and UPI messages.
Extract only completed money-out (debit/expense) transactions from the messages below.

Valid Categories to assign (use exactly one of these names): [${validCategories}].

Rules:
1. "smsId": The exact "id" from the input message.
2. "merchant": The business, merchant, or person receiving the payment (e.g. "Swiggy", "Amazon", "Shell Petrol", "D-Mart", "Uber", "Electricity Board"). Use an empty string if it cannot be determined.
3. "amount": The debited amount as a positive number. Never use an account balance, available balance, or credit amount.
4. "date": Transaction date in "YYYY-MM-DD" format. Use the approxDate when the message has no explicit date.
5. "category": Best matched category from [${validCategories}].
6. "type": "debit" or "credit".
7. "confidence": A number from 0 to 1 describing how certain you are.
8. "uncertain": true if the message is ambiguous or you had to guess the merchant or amount.

Exclude:
- OTPs, login alerts, verification codes and password messages.
- Credits, salary inflows, refunds, reversals and cashback credits.
- Balance-only notifications.
- Failed, declined, cancelled or reversed transactions.
- Promotional messages and payment/collect requests.
- Account balance amounts of any kind.

If no message contains a valid debit, return an empty array [].

Input SMS List:
${JSON.stringify(smsData, null, 2)}

CRITICAL: Return ONLY a raw JSON array without markdown code blocks:
[
  { "smsId": "...", "merchant": "...", "amount": 100, "date": "YYYY-MM-DD", "category": "...", "type": "debit", "confidence": 0.9, "uncertain": false }
]`;

        const executeParse = async () => {
            const normalized = [];

            for (let index = 0; index < candidates.length; index += SMS_CHUNK_SIZE) {
                const chunk = candidates.slice(index, index + SMS_CHUNK_SIZE);
                const smsData = chunk.map(message => ({
                    id: String(message.id),
                    from: maskSender(message.address),
                    body: redactSmsBody(message.body).slice(0, 300),
                    approxDate: dateToLocalYmd(message.date)
                }));

                const parsed = await callProviderJson(provider, {
                    feature: 'sms-parse',
                    model,
                    personalKey,
                    userId,
                    temperature: 0.1,
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: buildPrompt(smsData) }]
                        }
                    ],
                    parse: (text) => {
                        const value = parseJsonText(text, null);
                        if (!Array.isArray(value)) {
                            throw new Error('The selected AI provider returned an unreadable SMS response.');
                        }
                        return value;
                    }
                });

                normalized.push(...normalizeSmsParse(parsed, chunk, categoryNames));
            }

            if (userId) {
                const updated = await AIContentCache.upsert({
                    userId,
                    feature: SMS_CACHE_FEATURE,
                    contentHash,
                    paramsHash,
                    response: normalized
                });

                logAiEvent(updated ? 'sms-parse.cache-updated' : 'sms-parse.cache-saved', {
                    transactions: normalized.length,
                    hash: shortHash(contentHash)
                });
            }

            logAiEvent('sms-parse.complete', {
                messages: candidates.length,
                transactions: normalized.length
            });

            return { transactions: normalized, cached: false };
        };

        const dedupeKey = cacheKey
            ? `${cacheKey}:${refresh ? 'refresh' : 'normal'}`
            : null;

        return runDeduped(dedupeKey, executeParse);
    }
};

/**
 * Call Gemini API with Automatic / Multi-Turn Function Calling.
 * If Gemini requests data from MySQL via tools, execute them and feed results
 * back to Gemini until it delivers a final grounded advisor response.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} userId
 * @param {number} maxTurns
 * @returns {Promise<string>}
 */
async function callGeminiWithTools(systemPrompt, userPrompt, userId, maxTurns = 5, personalKey = null, conversationHistory = []) {
    let requestStartedAt = Date.now();
    let requestUsageRecorded = false;

    for (let attempt = 0; attempt <= 3; attempt++) {
        try {
            const genai = getAIFor(personalKey);
            const contents = [
                ...conversationHistory.map(message => ({
                    role: message.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: message.content }]
                })),
                { role: 'user', parts: [{ text: userPrompt }] }
            ];

            let turn = 0;
            while (turn < maxTurns) {
                turn++;
                const startedAt = Date.now();
                requestStartedAt = startedAt;
                requestUsageRecorded = false;
                const response = await genai.models.generateContent({
                    model: MODEL,
                    contents,
                    config: {
                        systemInstruction: systemPrompt,
                        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
                        maxOutputTokens: 4096,
                        temperature: 0.7
                    }
                });

                await recordAIUsage({
                    userId,
                    provider: 'gemini',
                    model: MODEL,
                    feature: 'chat',
                    ...getGeminiTokenUsage(response),
                    durationMs: Date.now() - startedAt,
                    statusCode: 200
                });
                requestUsageRecorded = true;

                const functionCalls = response.functionCalls;

                // If no tools called, we have our final text response!
                if (!functionCalls || functionCalls.length === 0) {
                    if (!response.text?.trim()) {
                        throw new Error('Gemini returned an empty response.');
                    }
                    return response.text;
                }

                logAiEvent('gemini.tool-calls', {
                    turn,
                    count: functionCalls.length,
                    names: functionCalls.map(call => call.name)
                });

                // Append assistant's candidate content (which includes the functionCalls)
                contents.push(response.candidates[0].content);

                // Execute each tool against MySQL and build response parts
                const functionResponseParts = [];
                for (const call of functionCalls) {
                    try {
                        const result = await executeToolCall(call.name, call.args || {}, userId);
                        functionResponseParts.push({
                            functionResponse: {
                                name: call.name,
                                response: result
                            }
                        });
                    } catch (toolErr) {
                        console.error(`[AI TOOLS] Execution error in ${call.name}:`, toolErr.message);
                        functionResponseParts.push({
                            functionResponse: {
                                name: call.name,
                                response: { error: toolErr.message }
                            }
                        });
                    }
                }

                // Append tool results as a user turn
                contents.push({
                    role: 'user',
                    parts: functionResponseParts
                });
            }

            throw new Error(`Exceeded max tool turns (${maxTurns}) without a final answer`);
        } catch (error) {
            if (!requestUsageRecorded) {
                await recordAIUsage({
                    userId,
                    provider: 'gemini',
                    model: MODEL,
                    feature: 'chat',
                    durationMs: Date.now() - requestStartedAt,
                    statusCode: Number.isInteger(Number(error.status || error.statusCode))
                        ? Number(error.status || error.statusCode)
                        : null
                });
            }
            logAiEvent('gemini.tool-request-failed', {
                status: String(error.status || error.statusCode || error.code || 'unknown'),
                attempt: attempt + 1
            });

            // Rate limit rotation
            if (error.status === 429 || error.message?.includes('429')) {
                if (rotateKeyFor(personalKey)) {
                    console.log(`Rate limited. Rotated to key #${currentKeyIndex + 1}. Retrying...`);
                    continue;
                }
                const waitMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }

            if (error.status === 500 || error.status === 503) {
                rotateKeyFor(personalKey);
                continue;
            }

            break;
        }
    }

    const error = new Error('Google Gemini could not complete the advisor request. Check AI Settings and try again.');
    error.statusCode = 503;
    throw error;
}

/**
 * Call Gemini API with exponential backoff for rate limits (Single turn without tools)
 * Used by generateAnalysis.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} maxRetries
 * @returns {string} Response text
 */
async function callGeminiWithRetry(systemPrompt, userPrompt, maxRetries = 3, personalKey = null, userId = null, feature = 'analysis') {
    const genai = getAIFor(personalKey);
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const startedAt = Date.now();
        try {
            const response = await genai.models.generateContent({
                model: MODEL,
                contents: userPrompt,
                config: {
                    systemInstruction: systemPrompt,
                    maxOutputTokens: 4096,
                    temperature: 0.7
                }
            });

            if (!response.text?.trim()) {
                const emptyError = new Error('Google Gemini returned an empty response.');
                emptyError.statusCode = 502;
                throw emptyError;
            }
            await recordAIUsage({
                userId,
                provider: 'gemini',
                model: MODEL,
                feature,
                ...getGeminiTokenUsage(response),
                durationMs: Date.now() - startedAt,
                statusCode: 200
            });
            return response.text;
        } catch (error) {
            lastError = error;
            logAiEvent('gemini.request-failed', {
                status: String(error.status || error.code || 'unknown'),
                attempt: attempt + 1
            });
            await recordAIUsage({
                userId,
                provider: 'gemini',
                model: MODEL,
                feature,
                durationMs: Date.now() - startedAt,
                statusCode: Number.isInteger(Number(error.status || error.statusCode))
                    ? Number(error.status || error.statusCode)
                    : null
            });

            if (error.status === 429 || error.message?.includes('429')) {
                if (rotateKeyFor(personalKey)) {
                    console.log(`Rate limited. Rotated to key #${currentKeyIndex + 1}. Retrying immediately...`);
                    continue;
                }
                const waitMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                console.log(`All keys rate limited. Waiting ${Math.round(waitMs)}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                continue;
            }

            if (error.status === 500 || error.status === 503) {
                rotateKeyFor(personalKey);
                continue;
            }

            break;
        }
    }

    const error = new Error('Google Gemini is unavailable. Check your API key and try again.');
    error.statusCode = lastError?.statusCode || 503;
    throw error;
}

module.exports = AIService;
