import { useState } from 'react';
import API from '../../api/axios';
import { HiOutlineSparkles } from 'react-icons/hi2';
import toast from 'react-hot-toast';
import { renderAdvisorMarkdown } from '../../utils/advisorFormatter';

// ── Health Signal Configuration ──────────────────────────────────────────────
const HEALTH_CONFIG = {
    green: {
        bg:    'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
        border: '#6ee7b7',
        icon:   '🟢',
        label:  'Finances look healthy',
        text:   '#065f46',
    },
    yellow: {
        bg:    'linear-gradient(135deg, #fef9c3 0%, #fde68a 100%)',
        border: '#fbbf24',
        icon:   '🟡',
        label:  'Some areas need attention',
        text:   '#92400e',
    },
    red: {
        bg:    'linear-gradient(135deg, #fee2e2 0%, #fca5a5 100%)',
        border: '#f87171',
        icon:   '🔴',
        label:  'Action needed — spending is off track',
        text:   '#7f1d1d',
    }
};

// ── Category badge styling by flag ───────────────────────────────────────────
const FLAG_STYLE = {
    major_spike: { icon: '🔴', bg: '#fee2e2', border: '#fca5a5', text: '#7f1d1d' },
    spike:       { icon: '🟡', bg: '#fef9c3', border: '#fde68a', text: '#78350f' },
    saving:      { icon: '🟢', bg: '#d1fae5', border: '#6ee7b7', text: '#065f46' },
    normal:      { icon: '✅', bg: '#f0f9ff', border: '#bae6fd', text: '#0c4a6e' },
    new:         { icon: '🆕', bg: '#f5f3ff', border: '#c4b5fd', text: '#4c1d95' },
};

/** Compact Indian-locale number formatter (₹12,345 → ₹12.3K, ₹1,23,456 → ₹1.2L) */
function shortFmt(n) {
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
    return `₹${n}`;
}

// ── Traffic Light Banner ─────────────────────────────────────────────────────
const HealthBanner = ({ signal }) => {
    const cfg = HEALTH_CONFIG[signal] || HEALTH_CONFIG.green;
    return (
        <div style={{
            background:   cfg.bg,
            border:       `1px solid ${cfg.border}`,
            borderRadius: '10px',
            padding:      '0.65rem 1rem',
            marginBottom: '1rem',
            display:      'flex',
            alignItems:   'center',
            gap:          '0.5rem',
        }}>
            <span style={{ fontSize: '1.2rem' }}>{cfg.icon}</span>
            <span style={{ fontWeight: 700, color: cfg.text, fontSize: '0.9rem' }}>
                {cfg.label}
            </span>
        </div>
    );
};

// ── Category Delta Badges ────────────────────────────────────────────────────
const CategoryBadges = ({ deltaMatrix }) => {
    if (!deltaMatrix || deltaMatrix.length === 0) return null;

    // Only show spikes, savings, and majors — skip plain normal ones to save space
    const notable = deltaMatrix.filter(d =>
        d.flag === 'major_spike' || d.flag === 'spike' || d.flag === 'saving'
    );
    const rest = deltaMatrix.filter(d => d.flag === 'normal' || d.flag === 'new');

    return (
        <div style={{ marginBottom: '1.25rem' }}>
            <p style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem'
            }}>
                Category Snapshot
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {notable.map(d => {
                    const s = FLAG_STYLE[d.flag];
                    const changeStr = d.changePercent !== null
                        ? (d.changePercent > 0 ? `+${d.changePercent}%` : `${d.changePercent}%`)
                        : 'New';
                    return (
                        <div key={d.category} style={{
                            background:   s.bg,
                            border:       `1px solid ${s.border}`,
                            borderRadius: '20px',
                            padding:      '0.3rem 0.65rem',
                            display:      'flex',
                            alignItems:   'center',
                            gap:          '0.35rem',
                            fontSize:     '0.78rem',
                            color:        s.text,
                            fontWeight:   600,
                        }}>
                            <span>{s.icon}</span>
                            <span>{d.category}</span>
                            <span style={{ opacity: 0.8, fontWeight: 400 }}>
                                {shortFmt(d.current)} {changeStr && `(${changeStr})`}
                            </span>
                        </div>
                    );
                })}

                {/* Collapsible normal categories */}
                {rest.map(d => {
                    const s = FLAG_STYLE[d.flag];
                    return (
                        <div key={d.category} style={{
                            background:   s.bg,
                            border:       `1px solid ${s.border}`,
                            borderRadius: '20px',
                            padding:      '0.3rem 0.65rem',
                            display:      'flex',
                            alignItems:   'center',
                            gap:          '0.35rem',
                            fontSize:     '0.76rem',
                            color:        s.text,
                            opacity:      0.85,
                        }}>
                            <span>{s.icon}</span>
                            <span>{d.category}</span>
                            <span style={{ opacity: 0.7 }}>{shortFmt(d.current)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Micro Leakage Warning ────────────────────────────────────────────────────
const MicroLeakageWarning = ({ microLeakage }) => {
    if (!microLeakage || microLeakage.length === 0) return null;
    return (
        <div style={{
            background:   '#fff7ed',
            border:       '1px solid #fed7aa',
            borderRadius: '8px',
            padding:      '0.6rem 0.9rem',
            marginBottom: '1rem',
            fontSize:     '0.8rem',
            color:        '#7c2d12',
        }}>
            <strong>⚠ Small spend leakage detected: </strong>
            {microLeakage.map((m, i) => (
                <span key={m.category}>
                    {i > 0 && ' · '}
                    {m.category} {shortFmt(m.total)} ({m.frequency} transactions)
                </span>
            ))}
        </div>
    );
};

// ── Main Component ───────────────────────────────────────────────────────────
const AnalysisPanel = () => {
    const [analysis,     setAnalysis]     = useState(null);
    const [summary,      setSummary]      = useState(null);
    const [healthSignal, setHealthSignal] = useState(null);
    const [loading,      setLoading]      = useState(false);
    const [cached,       setCached]       = useState(false);

    const runAnalysis = async (refresh = false) => {
        setLoading(true);
        try {
            const res = await API.post('/ai/analyze', { refresh });
            const { analysis, summary, healthSignal, cached: isCached } = res.data.data;
            setAnalysis(analysis);
            setSummary(summary);
            setHealthSignal(healthSignal || 'green');
            setCached(isCached);
            if (isCached) {
                toast('Showing cached analysis', { icon: '💾' });
            } else {
                toast.success('Analysis complete!');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Analysis failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="analysis-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                <HiOutlineSparkles style={{ color: '#a78bfa' }} />
                AI Financial Analysis
                {cached && <span className="cached-badge">💾 Cached</span>}
            </h3>

            {/* ── Empty state ─────────────────────────────────────────────────── */}
            {!analysis && !loading && (
                <div className="ai-trigger">
                    <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🤖</div>
                    <p>
                        Get a personalized financial analysis — your advisor will compare every
                        spending category against your own historical patterns and tell you exactly
                        what needs attention.
                    </p>
                    <button className="btn btn-primary" onClick={() => runAnalysis()}>
                        <HiOutlineSparkles /> Analyze My Finances
                    </button>
                </div>
            )}

            {/* ── Loading ─────────────────────────────────────────────────────── */}
            {loading && (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <div className="spinner" style={{ margin: '0 auto 1rem' }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Comparing your spending against historical patterns...
                    </p>
                </div>
            )}

            {/* ── Results ─────────────────────────────────────────────────────── */}
            {analysis && !loading && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* Traffic light banner */}
                    {healthSignal && <HealthBanner signal={healthSignal} />}

                    {/* Category delta badges */}
                    {summary?.deltaMatrix && (
                        <CategoryBadges deltaMatrix={summary.deltaMatrix} />
                    )}

                    {/* Micro-leakage warning */}
                    {summary?.microLeakage && (
                        <MicroLeakageWarning microLeakage={summary.microLeakage} />
                    )}

                    {/* AI analysis text */}
                    <div
                        className="analysis-content markdown-content custom-scrollbar"
                        dangerouslySetInnerHTML={{ __html: renderAdvisorMarkdown(analysis) }}
                        style={{
                            lineHeight: '1.7',
                            color:      'var(--text-secondary)',
                            flex:        1,
                            overflowY:  'auto',
                            paddingRight: '12px'
                        }}
                    />

                    {/* Re-analyze button */}
                    <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => runAnalysis(true)}>
                            <HiOutlineSparkles /> Re-analyze
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnalysisPanel;
