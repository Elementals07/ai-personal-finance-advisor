/**
 * Validation and normalization helpers shared by the receipt and SMS AI features.
 * Kept dependency-free (except crypto) so parsing rules stay consistent and testable.
 */
const crypto = require('crypto');

const FALLBACK_CATEGORY = 'Others';
const EPSILON = 0.01;

function roundMoney(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

function toAmount(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : NaN;
    }
    if (typeof value !== 'string') return NaN;

    const cleaned = value
        .replace(/[₹,\s]/g, '')
        .replace(/^rs\.?/i, '')
        .replace(/^inr\.?/i, '')
        .trim();

    if (!cleaned || !/^-?\d+(?:\.\d+)?$/.test(cleaned)) return NaN;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : NaN;
}

function isValidDateString(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

function dateToLocalYmd(value) {
    if (value === null || value === undefined || value === '') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeCategory(category, validCategories) {
    const list = Array.isArray(validCategories)
        ? validCategories.filter(name => typeof name === 'string' && name.trim())
        : [];

    const requested = typeof category === 'string' ? category.trim() : '';
    if (requested) {
        const exact = list.find(name => name === requested);
        if (exact) return exact;

        const lower = requested.toLowerCase();
        const caseInsensitive = list.find(name => name.toLowerCase() === lower);
        if (caseInsensitive) return caseInsensitive;
    }

    if (list.length === 0) return FALLBACK_CATEGORY;

    return (
        list.find(name => name.toLowerCase() === FALLBACK_CATEGORY.toLowerCase()) ||
        list[0]
    );
}

/**
 * Validates the raw Gemini Vision receipt response. Never invents amounts:
 * unreadable line items are skipped and reported as warnings instead.
 */
function normalizeReceiptResult(raw, validCategories) {
    const fallbackCategory = normalizeCategory(null, validCategories);
    const warnings = [];

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
            merchant: 'Local Store',
            totalAmount: 0,
            billDate: null,
            dateDetected: false,
            primaryCategory: fallbackCategory,
            summary: '',
            items: [],
            warnings: ['The receipt could not be parsed. Please review the fields manually.']
        };
    }

    let merchant = typeof raw.merchant === 'string' ? raw.merchant.trim() : '';
    if (!merchant) {
        merchant = 'Local Store';
        warnings.push('Merchant could not be read from the receipt.');
    }

    let totalAmount = toAmount(raw.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        totalAmount = 0;
        warnings.push('The receipt total could not be read. Please enter it manually.');
    } else {
        totalAmount = roundMoney(totalAmount);
    }

    let billDate = isValidDateString(raw.billDate) ? raw.billDate : null;
    if (!billDate) {
        warnings.push('The bill date could not be read. Today\'s date is used unless you change it.');
    }

    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items = [];
    let skippedItems = 0;

    for (const rawItem of rawItems) {
        if (!rawItem || typeof rawItem !== 'object') {
            skippedItems += 1;
            continue;
        }

        const amount = toAmount(rawItem.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            skippedItems += 1;
            continue;
        }

        const name = typeof rawItem.name === 'string' ? rawItem.name.trim() : '';
        items.push({
            name: name || 'Unnamed item',
            amount: roundMoney(amount),
            category: normalizeCategory(rawItem.category, validCategories)
        });
    }

    if (skippedItems > 0) {
        warnings.push(
            `${skippedItems} line item${skippedItems === 1 ? '' : 's'} had an unreadable amount and ${skippedItems === 1 ? 'was' : 'were'} skipped.`
        );
    }

    if (Array.isArray(raw.warnings)) {
        for (const warning of raw.warnings) {
            if (typeof warning !== 'string' || !warning.trim()) continue;
            const cleaned = warning.trim();
            if (warnings.some(item => item.toLowerCase() === cleaned.toLowerCase())) continue;
            warnings.push(cleaned);
        }
    }

    return {
        merchant,
        totalAmount,
        billDate,
        dateDetected: Boolean(billDate),
        primaryCategory: normalizeCategory(raw.primaryCategory, validCategories),
        summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
        items,
        warnings
    };
}

const OTP_RE = /\b(otp|one[-\s]?time password|verification code|auth(?:entication)? code|do not share)\b/i;
const CREDIT_RE = /\b(credited|credit of|received (?:rs|inr|money)|refund(?:ed)?|reversal|cashback credited|money received)\b/i;
const FAILED_RE = /\b(failed|declined|unsuccessful|not successful|cancelled|reversed|not processed)\b/i;
const REQUEST_RE = /\b(payment request|collect request|requesting|please pay|request money)\b/i;
const PROMO_RE = /\b(offer|discount|coupon|apply now|click here|unsubscribe|win\b|loan offer|limited time|buy now|get flat)\b/i;
const DEBIT_RE = /\b(debited|debit|spent|paid|withdrawn|sent|transferred|purchase)\b/i;
const AMOUNT_RE = /(?:rs\.?|inr|₹)\s*[\d,]+(?:\.\d{1,2})?/i;

function isExcludedSmsBody(text) {
    const body = String(text || '');
    if (!body.trim()) return true;
    if (OTP_RE.test(body)) return true;
    if (CREDIT_RE.test(body)) return true;
    if (FAILED_RE.test(body)) return true;
    if (REQUEST_RE.test(body)) return true;
    if (PROMO_RE.test(body) && !DEBIT_RE.test(body)) return true;
    return false;
}

function isDebitSmsBody(text) {
    const body = String(text || '');
    if (isExcludedSmsBody(body)) return false;
    return DEBIT_RE.test(body) && AMOUNT_RE.test(body);
}

/**
 * Redacts account numbers, UPI IDs, balances and OTP digits before any SMS
 * text leaves the backend for Gemini. Amounts are preserved.
 */
function redactSmsBody(text) {
    let body = String(text || '');

    body = body
        .replace(/\b(avl\.?\s*bal|available balance|a\/c balance|account balance)[^.;\n]*/gi, '[balance hidden]')
        .replace(/\b(?:a\/c|ac|account)\s*(?:no\.?|number)?\s*[*xX]*\s*\d{3,}/gi, 'A/C ****')
        .replace(/\b\d{9,}\b/g, '****')
        .replace(/\b[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}\b/g, '[upi-id]')
        .replace(/\b(?:otp|code)\s*(?:is|:)?\s*\d{4,8}\b/gi, 'OTP ****');

    return body.replace(/\s+/g, ' ').trim();
}

function maskSender(address) {
    const value = String(address || '').toUpperCase().trim();
    if (!value) return 'Bank';
    const parts = value.split('-');
    const code = parts.length > 1 ? parts.slice(1).join('-') : value;
    return code.slice(0, 12);
}

function normalizeSmsContent(messages) {
    return (Array.isArray(messages) ? messages : []).map(message => ({
        id: String(message?.id ?? ''),
        address: String(message?.address ?? message?.from ?? '').trim().toLowerCase(),
        body: String(message?.body ?? '').replace(/\s+/g, ' ').trim().toLowerCase(),
        date: message?.date ?? null
    })).sort((left, right) => (
        left.id.localeCompare(right.id)
        || left.body.localeCompare(right.body)
    ));
}

function smsFingerprint(body) {
    const normalized = String(body || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return `sms_${crypto.createHash('sha256').update(normalized).digest('hex')}`;
}

/**
 * Validates and normalizes the model output for a batch of SMS messages.
 * Invalid, credit, duplicate and excluded messages are dropped. Raw SMS
 * bodies are deliberately not included in the cached result.
 */
function normalizeSmsParse(rawItems, messages, validCategories) {
    const inputById = new Map(
        (Array.isArray(messages) ? messages : []).map(message => [String(message?.id ?? ''), message])
    );
    const seen = new Set();
    const results = [];
    const list = Array.isArray(rawItems) ? rawItems : [];

    for (const raw of list) {
        if (!raw || typeof raw !== 'object') continue;

        const smsId = String(raw.smsId ?? raw.id ?? '');
        if (!smsId || seen.has(smsId)) continue;

        const input = inputById.get(smsId);
        if (!input) continue;

        const body = String(input.body || '');
        const modelType = String(raw.type || '').toLowerCase();

        if (isExcludedSmsBody(body)) continue;
        if (modelType === 'credit') continue;
        if (!isDebitSmsBody(body) && modelType !== 'debit') continue;

        const amount = toAmount(raw.amount);
        if (!Number.isFinite(amount) || amount <= 0) continue;

        const fallbackDate = dateToLocalYmd(input.date);
        const date = isValidDateString(raw.date) ? raw.date : fallbackDate;
        if (!date) continue;

        let merchant = typeof raw.merchant === 'string' ? raw.merchant.trim() : '';
        let needsReview = false;

        if (!merchant) {
            merchant = 'Unknown Merchant';
            needsReview = true;
        }

        if (raw.uncertain === true || raw.needsReview === true) {
            needsReview = true;
        }

        const confidence = Number(raw.confidence);
        if (Number.isFinite(confidence) && confidence < 0.5) {
            needsReview = true;
        }

        if (amount >= 1000000) {
            needsReview = true;
        }

        seen.add(smsId);
        results.push({
            smsId,
            merchant,
            amount: roundMoney(amount),
            date,
            category: normalizeCategory(raw.category, validCategories),
            type: 'debit',
            source: maskSender(input.address),
            fingerprint: smsFingerprint(body),
            needsReview
        });
    }

    return results;
}

module.exports = {
    FALLBACK_CATEGORY,
    roundMoney,
    toAmount,
    isValidDateString,
    dateToLocalYmd,
    normalizeCategory,
    normalizeReceiptResult,
    isExcludedSmsBody,
    isDebitSmsBody,
    redactSmsBody,
    maskSender,
    normalizeSmsContent,
    smsFingerprint,
    normalizeSmsParse
};
