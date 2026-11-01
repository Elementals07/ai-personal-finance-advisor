/**
 * AI Service Layer
 * Handles all interactions with Google Gemini API
 * - Prompt generation
 * - Response caching
 * - Rate limit handling with exponential backoff
 * 
 * IMPORTANT: Gemini NEVER receives raw transaction data.
 * Only processed summaries are sent.
 */
const { GoogleGenAI } = require('@google/genai');
const AIInsightsCache = require('../models/AIInsightsCache');
const DataProcessingService = require('./dataProcessingService');
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

const MODEL = 'gemini-2.5-flash';

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
     * Generate financial analysis using Gemini
     * Checks cache first, only calls API if needed
     * @param {number} userId
     * @param {string} month - Format: YYYY-MM
     * @returns {object} { analysis, cached, summary }
     */
    async generateAnalysis(userId, month = null, refresh = false) {
        // Step 1: Generate processed financial summary with delta matrix
        const summary = await DataProcessingService.generateFinancialSummary(userId, month);

        // Step 2: Build ultra-dense, human-advisor context block
        const summaryText = DataProcessingService.formatForHumanAdvisorPrompt(summary);
        const dataHash    = DataProcessingService.hashSummary(summary);

        // Step 3: Build the prompt
        const prompt     = ANALYSIS_USER_PROMPT(summaryText);
        const promptHash = AIInsightsCache.hash(prompt);

        // Step 4: Check cache (skip if refresh is true)
        if (!refresh) {
            const cached = await AIInsightsCache.findValid(userId, 'analysis', promptHash, dataHash);
            if (cached) {
                return {
                    analysis:     cached.response,
                    cached:       true,
                    summary,
                    healthSignal: summary.healthSignal
                };
            }
        }

        // Step 5: Call Gemini API
        try {
            console.log(`[AI SERVICE] Starting analysis for user ${userId}...`);
            const response = await callGeminiWithRetry(ANALYSIS_SYSTEM_PROMPT, prompt);

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
        } catch (apiError) {
            console.error('[AI SERVICE] CRITICAL FAILURE during generateAnalysis:', apiError);
            throw apiError;
        }
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
     * Gemini can call tools to query any period, category, or trend across the entire DB.
     *
     * @param {number} userId
     * @param {string} userMessage - User's question
     * @param {string|null} month  - Format: YYYY-MM (optional baseline context)
     * @param {string} timeframe   - 'Today', 'This Week', 'This Month', 'All'
     * @returns {object} { reply, cached }
     */
    async chat(userId, userMessage, month = null, timeframe = 'All') {
        // Step 1: Build the user orientation index & advisor system prompt
        const userIndex = await buildUserIndex(userId);
        const systemPrompt = buildAdvisorSystemPrompt(userIndex);

        // Step 2: Build baseline current-period context
        const summary = await DataProcessingService.generateFinancialSummary(userId, month, timeframe);
        const baselineContext = DataProcessingService.formatForHumanAdvisorPrompt(summary);

        const fullUserPrompt = `[CURRENT PERIOD CONTEXT]\n${baselineContext}\n\n[USER QUESTION]\n${userMessage}`;

        const dataHash = DataProcessingService.hashSummary(summary);
        const promptHash = AIInsightsCache.hash(fullUserPrompt);

        // Step 3: Check cache (1 hour TTL for chat)
        const cached = await AIInsightsCache.findValid(userId, 'chat', promptHash, dataHash);
        if (cached) {
            return {
                reply: cached.response,
                cached: true
            };
        }

        // Step 4: Call Gemini with full Function Calling capabilities
        console.log(`[AI SERVICE] Starting tool-enabled chat for user ${userId}: "${userMessage.slice(0, 60)}..."`);
        const reply = await callGeminiWithTools(systemPrompt, fullUserPrompt, userId);

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
     * Uses Gemini 2.5 Flash Vision.
     *
     * @param {string} base64Data  - Base64 encoded image string
     * @param {string} mimeType    - e.g. 'image/jpeg', 'image/png', 'image/webp'
     * @param {Array<string>} userCategories - List of user's valid category names
     * @returns {Promise<object>} Structured receipt data
     */
    async scanReceiptImage(base64Data, mimeType = 'image/jpeg', userCategories = []) {
        // Strip data URI header if present (e.g. "data:image/jpeg;base64,")
        const cleanBase64 = base64Data.replace(/^data:image\/[a-z0-9\-+.]+;base64,/, '');

        const validCategories = userCategories.length > 0
            ? userCategories.join(', ')
            : 'Food, Groceries, Shopping, Utilities, Health, Education, Entertainment, Travel, Rent, Others';

        const prompt = `You are an expert OCR receipt and bill parser for an Indian personal finance system.
Examine this image of a receipt, invoice, or handwritten bill carefully.

Extract and output a valid JSON object with the following fields:
1. "merchant": The name of the store, vendor, shop, hospital, or company (e.g. "D-Mart", "Apollo Pharmacy", "Swiggy", "Indian Oil", "More Supermarket"). If unknown, use "Local Store".
2. "totalAmount": The final total amount paid in Rupees as a number (e.g. 1450.50). Do not include currency symbols.
3. "billDate": The date printed on the bill in exact "YYYY-MM-DD" format.
   - If the year is 2 digits (e.g. 26 or 25), convert to 4 digits (e.g. 2026).
   - If the date is missing, blurry, or cannot be determined with certainty, set "billDate" to null.
4. "dateDetected": true if a date was found on the bill, false if null.
5. "primaryCategory": The single best category matching one of: [${validCategories}].
6. "summary": A brief 1-sentence description of what this bill is for (e.g. "Weekly groceries at D-Mart").
7. "items": An array of individual line items if clearly listed on the bill. For each item:
   - "name": Item description (e.g. "Sunflower Oil 1L")
   - "amount": Price in Rupees (number)
   - "category": Best category from [${validCategories}]
   If line items are not distinguishable, return an empty array [].

CRITICAL: Return ONLY raw JSON without markdown code fences or backticks.`;

        const genai = getAI();
        let lastError;

        for (let attempt = 0; attempt <= 3; attempt++) {
            try {
                const response = await genai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                {
                                    inlineData: {
                                        data: cleanBase64,
                                        mimeType: mimeType || 'image/jpeg'
                                    }
                                },
                                {
                                    text: prompt
                                }
                            ]
                        }
                    ],
                    config: {
                        responseMimeType: 'application/json',
                        temperature: 0.2
                    }
                });

                let parsed;
                try {
                    parsed = JSON.parse(response.text);
                } catch (e) {
                    const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
                    parsed = JSON.parse(cleanText);
                }

                const totalAmount = parseFloat(parsed.totalAmount) || 0;
                let billDate = parsed.billDate;
                if (billDate && !/^\d{4}-\d{2}-\d{2}$/.test(billDate)) {
                    billDate = null;
                }

                return {
                    merchant:        parsed.merchant || 'Local Store',
                    totalAmount:     totalAmount,
                    billDate:        billDate,
                    dateDetected:    Boolean(billDate),
                    primaryCategory: parsed.primaryCategory || 'Others',
                    summary:         parsed.summary || '',
                    items:           Array.isArray(parsed.items) ? parsed.items : []
                };
            } catch (error) {
                lastError = error;
                console.error(`[AI RECEIPT OCR] Error (attempt ${attempt + 1}):`, error.message);
                if (rotateKey()) {
                    continue;
                }
                const waitMs = 1500 * (attempt + 1);
                await new Promise(r => setTimeout(r, waitMs));
            }
        }

        throw new Error(`Failed to parse receipt image: ${lastError?.message || 'Unknown error'}`);
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
async function callGeminiWithTools(systemPrompt, userPrompt, userId, maxTurns = 5) {
    let lastError;

    for (let attempt = 0; attempt <= 3; attempt++) {
        try {
            const genai = getAI();
            const contents = [
                { role: 'user', parts: [{ text: userPrompt }] }
            ];

            let turn = 0;
            while (turn < maxTurns) {
                turn++;
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

                const functionCalls = response.functionCalls;

                // If no tools called, we have our final text response!
                if (!functionCalls || functionCalls.length === 0) {
                    return response.text || 'I reviewed your financial records, but could not produce a response.';
                }

                console.log(`[AI TOOLS] Turn ${turn}: Gemini invoked ${functionCalls.length} tool(s):`,
                    functionCalls.map(c => `${c.name}(${JSON.stringify(c.args || {})})`).join('; ')
                );

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
            lastError = error;
            console.error(`[AI SERVICE] Error in callGeminiWithTools (Key #${currentKeyIndex + 1}):`, error.message);

            // Rate limit rotation
            if (error.status === 429 || error.message?.includes('429')) {
                if (rotateKey()) {
                    console.log(`Rate limited. Rotated to key #${currentKeyIndex + 1}. Retrying...`);
                    continue;
                }
                const waitMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }

            if (error.status === 500 || error.status === 503) {
                rotateKey();
                continue;
            }

            break;
        }
    }

    throw new Error(`AI Tool execution failed: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Call Gemini API with exponential backoff for rate limits (Single turn without tools)
 * Used by generateAnalysis.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} maxRetries
 * @returns {string} Response text
 */
async function callGeminiWithRetry(systemPrompt, userPrompt, maxRetries = 3) {
    const genai = getAI();
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
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

            return response.text;
        } catch (error) {
            lastError = error;
            console.error(`[AI SERVICE] Gemini API Error (Key #${currentKeyIndex + 1}):`, {
                message: error.message,
                status: error.status,
                stack: error.stack
            });

            if (error.status === 429 || error.message?.includes('429')) {
                if (rotateKey()) {
                    console.log(`Rate limited. Rotated to key #${currentKeyIndex + 1}. Retrying immediately...`);
                    continue;
                }
                const waitMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                console.log(`All keys rate limited. Waiting ${Math.round(waitMs)}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                continue;
            }

            if (error.status === 500 || error.status === 503) {
                rotateKey();
                continue;
            }

            break;
        }
    }

    throw new Error(`Gemini API failed after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`);
}

module.exports = AIService;
