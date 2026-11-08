import AIProviderSettings from '../components/AI/AIProviderSettings';

const AISettingsPage = () => {
    return (
        <div>
            <div className="page-header">
                <div className="page-tag">
                    Configuration
                </div>
                <h1 className="page-title">AI Settings</h1>
                <p className="page-subtitle">
                    Choose your AI provider, pick a model for each feature, and review token pricing in INR.
                </p>
            </div>

            <AIProviderSettings />
        </div>
    );
};

export default AISettingsPage;
