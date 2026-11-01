import AnalysisPanel from '../components/AI/AnalysisPanel';
import ChatAssistant from '../components/AI/ChatAssistant';

const AIInsightsPage = () => {
    return (
        <div>
            <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '10px',
                        background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.1rem', boxShadow: '0 4px 12px rgba(99,102,241,0.3)'
                    }}>🤖</div>
                    <h1 style={{ margin: 0 }}>AI Insights</h1>
                </div>
                <p>Gemini-powered analysis of your real spending data — ask anything about your finances</p>
            </div>

            <div style={{ 
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1.5rem',
                height: 'calc(100vh - 200px)',
                minHeight: '580px',
            }}>
                <AnalysisPanel />
                <ChatAssistant />
            </div>
        </div>
    );
};

export default AIInsightsPage;
