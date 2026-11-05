import AnalysisPanel from '../components/AI/AnalysisPanel';
import ChatAssistant from '../components/AI/ChatAssistant';
import AIProviderSettings from '../components/AI/AIProviderSettings';

const AIInsightsPage = () => {
    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-tag">
                    AI Guidance
                </div>
                <h1 className="page-title">AI Advisor</h1>
                <p className="page-subtitle">
                    Practical financial guidance grounded strictly in your recorded transactions and budget plan.
                </p>
            </div>

            <AIProviderSettings />

            {/* Responsive 2-Column Grid — fixed height so inner flex columns can scroll */}
            <div style={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                gap: '1.5rem',
                alignItems: 'stretch'
            }}>
                <AnalysisPanel />
                <ChatAssistant />
            </div>
        </div>
    );
};

export default AIInsightsPage;
