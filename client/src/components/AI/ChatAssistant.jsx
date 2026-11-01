import { useState, useRef, useEffect } from 'react';
import API from '../../api/axios';
import { HiOutlinePaperAirplane } from 'react-icons/hi2';
import toast from 'react-hot-toast';
import { renderAdvisorMarkdown } from '../../utils/advisorFormatter';

const SUGGESTED_QUESTIONS = [
    "Give me summary and advice on first four months of this year",
    "Analyse my food spending across the whole year",
    "Which category spiked the most compared to my normal baseline?",
    "Where is my money silently leaking every month?",
    "What should I cut first to save ₹5,000 this month?",
];

const ChatAssistant = () => {
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: "Hey! I'm your personal finance advisor. I have your full spending history and can compare any category against your usual patterns — not just this month, but across months. Ask me something specific and I'll give you a straight answer with your actual numbers. 💡"
        }
    ]);
    const [input, setInput] = useState('');
    const [contextTimeframe, setContextTimeframe] = useState('All');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async (messageText = null) => {
        const text = messageText || input.trim();
        if (!text || loading) return;

        // Add user message
        const userMsg = { role: 'user', content: text };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const res = await API.post('/ai/chat', { 
                message: text,
                timeframe: contextTimeframe 
            });
            const aiMsg = { role: 'assistant', content: res.data.data.reply };
            setMessages(prev => [...prev, aiMsg]);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to get response');
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Sorry, I encountered an error. Please try again in a moment.'
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const [showInfo, setShowInfo] = useState(false);

    return (
        <div className="chat-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            {/* Info Modal - keep existing */}
            {showInfo && (
                <div className="modal-overlay" onClick={() => setShowInfo(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, borderRadius: 'var(--radius-xl)' }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '350px', padding: '1.5rem' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>💡</span> How to use AI Chat
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1rem' }}>
                            The AI acts as your personal financial advisor. Ask it to analyze your spending or give budgeting advice!
                        </p>
                        <div style={{ fontSize: '0.8rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Timeframe Contexts:</strong>
                            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-muted)' }}>
                                <li style={{ marginBottom: '0.3rem' }}><strong>Overall Summary:</strong> Fastest. Analyzes your total limits and categories.</li>
                                <li style={{ marginBottom: '0.3rem' }}><strong>Today / Week / Month:</strong> The AI will securely read your <em>precise line-by-line transactions</em> to answer detailed questions.</li>
                            </ul>
                        </div>
                        <button className="btn btn-primary" onClick={() => setShowInfo(false)} style={{ width: '100%', marginTop: '1.2rem' }}>Got it</button>
                    </div>
                </div>
            )}

            {/* Header */}
            <div style={{ 
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                padding: '1rem 1.25rem', 
                borderBottom: '1px solid var(--border-color)',
                background: 'linear-gradient(135deg, #fafbff, #f0f4ff)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1rem', boxShadow: '0 4px 10px rgba(99,102,241,0.3)',
                        flexShrink: 0
                    }}>🤖</div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>Financial AI</div>
                        <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                            Online · Full history access
                        </div>
                    </div>
                </div>
                <button 
                    onClick={() => setShowInfo(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.2s ease', padding: '0.25rem' }}
                    title="How it works"
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                    ⓘ
                </button>
            </div>

            {/* Messages Area */}
            <div className="chat-messages" style={{ flex: 1, overflowY: 'auto' }}>
                {messages.map((msg, i) => (
                    <div key={i} className={`chat-message ${msg.role}`}>
                        {msg.role === 'assistant' && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                                <div style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.8rem', flexShrink: 0, marginTop: '2px'
                                }}>🤖</div>
                                <div 
                                    className="message-bubble markdown-content"
                                    dangerouslySetInnerHTML={{ __html: renderAdvisorMarkdown(msg.content) }}
                                    style={{ flex: 1 }}
                                />
                            </div>
                        )}
                        {msg.role === 'user' && (
                            <div 
                                className="message-bubble markdown-content"
                                dangerouslySetInnerHTML={{ __html: renderAdvisorMarkdown(msg.content) }}
                            />
                        )}
                    </div>
                ))}

                {/* Typing indicator */}
                {loading && (
                    <div className="chat-message assistant">
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                            <div style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.8rem', flexShrink: 0
                            }}>🤖</div>
                            <div className="message-bubble">
                                <div className="typing-indicator">
                                    <span /><span /><span />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Suggested Questions */}
            {messages.length <= 2 && !loading && (
                <div style={{
                    padding: '0.75rem 1.25rem 0.25rem',
                    display: 'flex',
                    overflowX: 'auto',
                    gap: '0.5rem',
                    scrollbarWidth: 'none',
                }}>
                    {SUGGESTED_QUESTIONS.map((q, i) => (
                        <button
                            key={i}
                            onClick={() => sendMessage(q)}
                            style={{
                                flexShrink: 0,
                                padding: '0.4rem 0.9rem',
                                borderRadius: '20px',
                                border: '1px solid var(--border-premium)',
                                background: 'linear-gradient(135deg, #f5f3ff, #eff6ff)',
                                color: 'var(--color-purple)',
                                fontSize: '0.775rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                fontFamily: 'Inter, sans-serif',
                                whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, #ede9fe, #dbeafe)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.15)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, #f5f3ff, #eff6ff)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                            {q}
                        </button>
                    ))}
                </div>
            )}

            {/* Context selector */}
            <div style={{ padding: '0.4rem 1.25rem 0' }}>
                <select 
                    value={contextTimeframe} 
                    onChange={(e) => setContextTimeframe(e.target.value)}
                    style={{ 
                        padding: '0.25rem 0.75rem', 
                        fontSize: '0.75rem', 
                        borderRadius: '20px', 
                        border: '1px solid var(--border-color)', 
                        background: '#f8fafc', 
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        outline: 'none',
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 500,
                    }}
                >
                    <option value="All">📊 Overall History</option>
                    <option value="Today">📅 Today's Purchases</option>
                    <option value="This Week">🗓️ This Week</option>
                    <option value="This Month">📆 This Month</option>
                </select>
            </div>
            
            {/* Input Area */}
            <div className="chat-input-area" style={{ paddingTop: '0.4rem' }}>
                <input
                    type="text"
                    placeholder="Ask about your finances..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                    id="chat-input"
                    style={{ borderRadius: 'var(--radius-md)' }}
                />
                <button
                    className="btn btn-primary"
                    onClick={() => sendMessage()}
                    disabled={loading || !input.trim()}
                    style={{ padding: '0.7rem 1.1rem', flexShrink: 0 }}
                >
                    <HiOutlinePaperAirplane />
                </button>
            </div>
        </div>
    );
};

export default ChatAssistant;
