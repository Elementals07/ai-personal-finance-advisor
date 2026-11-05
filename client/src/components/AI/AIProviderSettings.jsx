import { useCallback, useEffect, useState } from 'react';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import {
    getAIProvider,
    hasPersonalGeminiKey,
    setAIProvider,
    setPersonalGeminiKey
} from '../../ai/providerSettings';

const AIProviderSettings = () => {
    const [provider, setProvider] = useState(getAIProvider);
    const [config, setConfig] = useState(null);
    const [usage, setUsage] = useState(null);
    const [keyDraft, setKeyDraft] = useState('');
    const [personalKeyAvailable, setPersonalKeyAvailable] = useState(hasPersonalGeminiKey());
    const [loading, setLoading] = useState(true);

    const loadConfig = useCallback(async () => {
        setLoading(true);
        try {
            const response = await API.get('/ai/config');
            setConfig(response.data?.data || null);
            setUsage(response.data?.data?.usage || null);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not load AI provider settings.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadConfig();
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
    const costInr = Number.isFinite(costUsd) && Number.isFinite(inrRate)
        ? costUsd * inrRate
        : null;
    const budgetInr = config?.pricing?.budgetInr ?? 10;
    const budgetPercent = costInr === null ? null : (costInr / budgetInr) * 100;

    return (
        <section className="card" aria-labelledby="ai-provider-settings-title" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
                <div>
                    <h2 id="ai-provider-settings-title" className="card-title">AI Settings</h2>
                    <p className="card-subtitle">Choose which provider handles new AI requests.</p>
                </div>
                <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={loadConfig}
                    disabled={loading}
                >
                    Refresh usage
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
                    <div><strong>Velona model:</strong> {config?.velona?.model || 'qwen/qwen3.7-flash'}</div>
                    <div>
                        <strong>Velona configuration:</strong>{' '}
                        {config?.velona?.configured ? 'Backend key configured' : 'Missing VELONA_API_KEY in backend .env'}
                    </div>
                    <div>
                        <strong>Gemini configuration:</strong>{' '}
                        {config?.gemini?.configured
                            ? `${config.gemini.keyCount} backend key${config.gemini.keyCount === 1 ? '' : 's'} configured`
                            : personalKeyAvailable
                                ? 'Personal key ready for this session'
                                : 'No Gemini key configured'}
                    </div>
                </div>

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
                                Estimated Velona charges: {Number.isFinite(costUsd) ? `$${costUsd.toFixed(6)} USD` : 'Not available'}
                                {costInr !== null ? ` (₹${costInr.toFixed(2)})` : ''}
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
                    {config?.pricing?.usdToInrRate == null && (
                        <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                            INR estimates require a current AI_USD_TO_INR_RATE in the backend .env. USD estimates do not represent Velona wallet balance or exact billed charges.
                        </small>
                    )}
                </div>
            </div>
        </section>
    );
};

export default AIProviderSettings;
