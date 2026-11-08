import { useCallback, useEffect, useState } from 'react';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import {
    getAIProvider,
    getAIModelSelections,
    hasPersonalGeminiKey,
    setAIModelSelection,
    setAIProvider,
    setPersonalGeminiKey
} from '../../ai/providerSettings';

const MODEL_FEATURES = [
    { key: 'chatbot', label: 'AI Chatbot', required: ['tools'] },
    { key: 'financialAnalysis', label: 'Financial Analysis', required: [] },
    { key: 'receiptScanning', label: 'Receipt Scanning', required: ['vision', 'json'] },
    { key: 'smsTransactionParsing', label: 'SMS Transaction Parsing', required: ['json'] }
];

const CAPABILITY_COLUMNS = [
    { key: 'text', label: 'Text' },
    { key: 'vision', label: 'Vision' },
    { key: 'json', label: 'JSON' },
    { key: 'tools', label: 'Tools' }
];

function modelCapability(model, capability) {
    if (model?.capabilities?.[capability] === true) return 'Yes';
    if (model?.capabilities?.[capability] === false) return 'No';
    return '—';
}

function formatInrPrice(value) {
    return value == null ? 'Unavailable' : `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 4 })}`;
}

function formatUsdPrice(value) {
    return value == null ? 'Unavailable' : `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 6 })}`;
}

const AIProviderSettings = () => {
    const [provider, setProvider] = useState(getAIProvider);
    const [modelSelections, setModelSelections] = useState(getAIModelSelections);
    const [config, setConfig] = useState(null);
    const [models, setModels] = useState([]);
    const [modelError, setModelError] = useState('');
    const [usage, setUsage] = useState(null);
    const [keyDraft, setKeyDraft] = useState('');
    const [personalKeyAvailable, setPersonalKeyAvailable] = useState(hasPersonalGeminiKey());
    const [loading, setLoading] = useState(true);

    const loadConfig = useCallback(async (refreshModels = false) => {
        const [configResult, modelsResult] = await Promise.allSettled([
            API.get('/ai/config'),
            API.get('/ai/models', { params: refreshModels ? { refresh: true } : undefined })
        ]);
        if (configResult.status === 'fulfilled') {
            setConfig(configResult.value.data?.data || null);
            setUsage(configResult.value.data?.data?.usage || null);
        } else {
            toast.error(configResult.reason.response?.data?.message || 'Could not load AI provider settings.');
        }
        if (modelsResult.status === 'fulfilled') {
            setModels(Array.isArray(modelsResult.value.data?.data?.models)
                ? modelsResult.value.data.data.models
                : []);
            setModelError('');
        } else {
            setModels([]);
            setModelError(modelsResult.reason.response?.data?.message || 'Could not load the Velona model catalogue.');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            loadConfig();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [loadConfig]);

    const geminiConfigured = Boolean(config?.gemini?.configured || personalKeyAvailable);

    const handleProviderChange = (event) => {
        const nextProvider = event.target.checked ? 'velona' : 'gemini';
        if (nextProvider === provider) return;

        if (nextProvider === 'gemini' && !geminiConfigured) {
            toast.error('Add a valid Gemini API key below before switching providers.');
            return;
        }

        const confirmed = window.confirm(
            'Switching providers changes where new AI requests are sent. Current requests will finish with their selected provider, and any unsaved receipt or SMS review remains unchanged. Continue?'
        );
        if (!confirmed) return;

        try {
            setAIProvider(nextProvider);
            setProvider(nextProvider);
        } catch (error) {
            toast.error(error.message || 'Could not save your AI provider selection.');
        }
    };

    const handleModelChange = (feature, modelId) => {
        try {
            setAIModelSelection(feature, modelId);
            setModelSelections(getAIModelSelections());
            toast.success('AI model selection saved for this account.');
        } catch (error) {
            toast.error(error.message || 'Could not save your AI model selection.');
        }
    };

    const saveGeminiKey = () => {
        const key = keyDraft.trim();
        if (!/^[A-Za-z0-9._-]{10,200}$/.test(key)) {
            toast.error('Enter a valid Gemini API key.');
            return;
        }
        setPersonalGeminiKey(key);
        setPersonalKeyAvailable(true);
        setKeyDraft('');
        toast.success('Gemini key is available for this session. It is not stored in the browser or sent to Velona.');
    };

    const costUsd = usage?.estimatedCostUsd == null
        ? Number.NaN
        : Number(usage.estimatedCostUsd);
    const inrRate = Number(config?.pricing?.usdToInrRate);
    const costInr = usage?.estimatedCostInr != null && Number.isFinite(Number(usage.estimatedCostInr))
        ? Number(usage.estimatedCostInr)
        : Number.isFinite(costUsd) && Number.isFinite(inrRate) && inrRate > 0
            ? costUsd * inrRate
            : null;
    const budgetInr = config?.pricing?.budgetInr ?? 10;
    const budgetPercent = costInr === null ? null : (costInr / budgetInr) * 100;

    return (
        <section className="card" aria-labelledby="ai-provider-settings-title">
            <div className="card-header">
                <div>
                    <h2 id="ai-provider-settings-title" className="card-title">Provider &amp; Models</h2>
                    <p className="card-subtitle">Choose where AI requests go and which model handles each feature.</p>
                </div>
                <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                        setLoading(true);
                        loadConfig(true);
                    }}
                    disabled={loading}
                >
                    Refresh usage &amp; models
                </button>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
                <label
                    htmlFor="use-velona-ai"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 700 }}
                >
                    <input
                        id="use-velona-ai"
                        type="checkbox"
                        checked={provider === 'velona'}
                        onChange={handleProviderChange}
                        disabled={loading}
                        style={{ width: '1.15rem', height: '1.15rem' }}
                    />
                    Use Velona AI
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {provider === 'velona' ? 'ON' : 'OFF'}
                    </span>
                </label>

                <div role="status" style={{ color: 'var(--text-secondary)' }}>
                    {provider === 'velona'
                        ? 'Velona is the active AI provider.'
                        : 'Velona is disabled. FinanceAI is using Google Gemini.'}
                </div>

                <div style={{ display: 'grid', gap: '0.35rem', color: 'var(--text-secondary)' }}>
                    <div><strong>Active provider:</strong> {provider === 'velona' ? 'Velona' : 'Google Gemini'}</div>
                    <div>
                        <strong>Velona configuration:</strong>{' '}
                        {config?.velona?.configured ? 'Backend key configured' : 'Missing VELONA_API_KEY in backend .env'}
                    </div>
                    <div>
                        <strong>Gemini configuration:</strong>{' '}
                        {config?.gemini?.configured
                            ? `${config.gemini.keyCount} backend key${config.gemini.keyCount === 1 ? '' : 's'} configured (${config.gemini.model})`
                            : personalKeyAvailable
                                ? 'Personal key ready for this session'
                                : 'No Gemini key configured'}
                    </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'grid', gap: '1rem' }}>
                    <div>
                        <strong>Velona models by AI feature</strong>
                        <p style={{ color: 'var(--text-secondary)', margin: '0.35rem 0 0' }}>
                            Model choices are saved separately for this account. Provider selection above remains independent.
                        </p>
                    </div>
                    {modelError && (
                        <div role="alert" style={{ color: 'var(--text-secondary)' }}>
                            {modelError} Model selection remains unchanged; retry with Refresh usage &amp; models.
                        </div>
                    )}
                    {!modelError && models.length === 0 && !loading && (
                        <div role="status" style={{ color: 'var(--text-secondary)' }}>
                            Velona returned no available models.
                        </div>
                    )}
                    {MODEL_FEATURES.map((feature) => {
                        const selected = modelSelections[feature.key] || config?.velona?.models?.[feature.key] || '';
                        const selectedModel = models.find(model => model.id === selected);
                        return (
                            <div key={feature.key} style={{ display: 'grid', gap: '0.4rem' }}>
                                <label htmlFor={`ai-model-${feature.key}`}><strong>{feature.label}</strong></label>
                                <select
                                    id={`ai-model-${feature.key}`}
                                    className="form-input"
                                    value={selected}
                                    onChange={(event) => handleModelChange(feature.key, event.target.value)}
                                    disabled={loading || models.length === 0}
                                >
                                    {!selectedModel && selected && (
                                        <option value={selected}>Selected model unavailable: {selected}</option>
                                    )}
                                    {!selected && (
                                        <option value="" disabled>
                                            {loading ? 'Loading models…' : 'No configured model'}
                                        </option>
                                    )}
                                    {models.map(model => {
                                        const unsupported = feature.required.some(capability =>
                                            model.capabilities?.[capability] === false
                                        );
                                        return (
                                            <option
                                                key={model.id}
                                                value={model.id}
                                                disabled={unsupported && model.id !== selected}
                                            >
                                                {model.name} — {model.provider}
                                                {unsupported ? ' (required capability unavailable)' : ''}
                                            </option>
                                        );
                                    })}
                                </select>
                                {selectedModel && (
                                    <small style={{ color: 'var(--text-secondary)' }}>
                                        {selectedModel.id} · Input: {formatInrPrice(selectedModel.pricing?.inputInrPerMillionTokens)} / 1M ·
                                        {' '}Output: {formatInrPrice(selectedModel.pricing?.outputInrPerMillionTokens)} / 1M ·
                                        {' '}Vision: {modelCapability(selectedModel, 'vision')} ·
                                        {' '}JSON: {modelCapability(selectedModel, 'json')} ·
                                        {' '}Tool calling: {modelCapability(selectedModel, 'tools')}
                                    </small>
                                )}
                                {selectedModel && feature.required.some(capability =>
                                    selectedModel.capabilities?.[capability] === false
                                ) && (
                                    <small role="alert" style={{ color: 'var(--text-secondary)' }}>
                                        This selected model does not support a capability required by {feature.label}.
                                    </small>
                                )}
                            </div>
                        );
                    })}
                </div>

                {models.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                        <strong>Model catalogue</strong>
                        <p style={{ color: 'var(--text-secondary)', margin: '0.35rem 0 0.75rem', fontSize: '0.8125rem' }}>
                            Prices are shown per 1 million tokens in INR, converted from the provider&apos;s USD rates.
                            “Unavailable” means the provider did not publish a price.
                        </p>
                        <div className="model-table-wrap">
                            <table className="model-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Model</th>
                                        <th scope="col">Input</th>
                                        <th scope="col">Output</th>
                                        {CAPABILITY_COLUMNS.map(column => (
                                            <th key={column.key} scope="col">{column.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {models.map(model => (
                                        <tr key={model.id}>
                                            <th scope="row">
                                                <span>{model.name}</span>
                                                <small>{model.id}</small>
                                            </th>
                                            <td>
                                                {formatInrPrice(model.pricing?.inputInrPerMillionTokens)}
                                                <small>{formatUsdPrice(model.pricing?.inputUsdPerMillionTokens)} USD</small>
                                            </td>
                                            <td>
                                                {formatInrPrice(model.pricing?.outputInrPerMillionTokens)}
                                                <small>{formatUsdPrice(model.pricing?.outputUsdPerMillionTokens)} USD</small>
                                            </td>
                                            {CAPABILITY_COLUMNS.map(column => (
                                                <td key={column.key}>{modelCapability(model, column.key)}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {(!config?.gemini?.configured || provider === 'gemini') && (
                    <div style={{ display: 'grid', gap: '0.5rem', maxWidth: '34rem' }}>
                        <label htmlFor="personal-gemini-key"><strong>Personal Gemini API key</strong></label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <input
                                id="personal-gemini-key"
                                type="password"
                                autoComplete="new-password"
                                value={keyDraft}
                                onChange={(event) => setKeyDraft(event.target.value)}
                                placeholder={personalKeyAvailable ? 'Key saved for this session' : 'Enter Gemini API key'}
                                className="form-input"
                                style={{ flex: '1 1 16rem' }}
                            />
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={saveGeminiKey}
                                disabled={!keyDraft.trim()}
                            >
                                Save for this session
                            </button>
                            {personalKeyAvailable && (
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => {
                                        setPersonalGeminiKey('');
                                        setPersonalKeyAvailable(false);
                                        toast.success('Personal Gemini key removed from this session.');
                                    }}
                                >
                                    Remove session key
                                </button>
                            )}
                        </div>
                        <small style={{ color: 'var(--text-secondary)' }}>
                            The key is kept in memory only, masked above, and sent only to the backend when Gemini is active. It is lost when this app session ends.
                        </small>
                    </div>
                )}

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                    <strong>Local AI usage</strong>
                    {usage ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                            <span>Requests: {Number(usage.requests || 0)}</span>
                            <span>Tokens: {Number(usage.totalTokens || 0).toLocaleString()}</span>
                            <span>Cache hits: {Number(usage.cacheHits || 0)}</span>
                            <span>
                                Estimated Velona charges: {costInr === null
                                    ? 'Unavailable'
                                    : `₹${costInr.toFixed(2)} INR`}
                                {Number.isFinite(costUsd) && ` ($${costUsd.toFixed(6)} USD)`}
                            </span>
                            <span>
                                Estimated budget use: {budgetPercent === null
                                    ? `₹${budgetInr} initial budget; INR conversion not configured`
                                    : `₹${costInr.toFixed(2)} of ₹${budgetInr} (${budgetPercent.toFixed(1)}%)`}
                            </span>
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 0' }}>
                            {loading ? 'Loading usage…' : 'Usage totals are not available.'}
                        </p>
                    )}
                    <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                        {inrRate == null || !Number.isFinite(inrRate) || inrRate <= 0
                            ? 'INR estimates require a current AI_USD_TO_INR_RATE in the backend .env. '
                            : `INR values use AI_USD_TO_INR_RATE = ${inrRate}. `}
                        Estimates do not represent Velona wallet balance or exact billed charges.
                    </small>
                </div>
            </div>
        </section>
    );
};

export default AIProviderSettings;
