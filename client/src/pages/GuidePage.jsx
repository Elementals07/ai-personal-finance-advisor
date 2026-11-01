import { useState } from 'react';
import { 
    HiOutlineSparkles, 
    HiOutlineCube, 
    HiOutlineChartBar, 
    HiOutlineFaceSmile,
    HiOutlineChevronDown,
    HiOutlineCreditCard,
    HiOutlineBanknotes,
    HiOutlinePresentationChartLine,
    HiOutlineShieldCheck
} from 'react-icons/hi2';

const AccordionItem = ({ icon, title, description, subFeatures, tips, isOpen, onToggle }) => {
    return (
        <div 
            className={`card ${isOpen ? 'active' : ''}`} 
            style={{ 
                marginBottom: '1rem', 
                padding: 0, 
                borderRadius: '20px', 
                overflow: 'hidden',
                border: isOpen ? '2px solid var(--primary-color)' : '1px solid rgba(0,0,0,0.05)',
                transition: 'all 0.3s ease',
                background: 'white'
            }}
        >
            <button 
                onClick={onToggle}
                style={{
                    width: '100%',
                    padding: '1.5rem 2rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.5rem',
                    background: 'none',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.2s ease'
                }}
            >
                <div style={{ 
                    width: '48px', 
                    height: '48px', 
                    borderRadius: '14px', 
                    background: isOpen ? 'var(--primary-color)' : '#f8fafc',
                    color: isOpen ? 'white' : 'var(--primary-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.4rem',
                    transition: 'all 0.3s ease'
                }}>
                    {icon}
                </div>
                <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
                    {!isOpen && <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '400px' }}>{description}</p>}
                </div>
                <HiOutlineChevronDown style={{ 
                    fontSize: '1.2rem', 
                    color: 'var(--text-muted)', 
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 0.3s ease'
                }} />
            </button>

            {isOpen && (
                <div style={{ 
                    padding: '0 2rem 2rem 5.5rem',
                    animation: 'fadeIn 0.4s ease'
                }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
                        {description}
                    </p>

                    {subFeatures && subFeatures.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Detailed Features</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                {subFeatures.map((sf, idx) => (
                                    <div key={idx} style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{sf.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{sf.desc}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div style={{ 
                        background: 'linear-gradient(to right, #f8fafc, #f1f5f9)', 
                        padding: '1.5rem', 
                        borderRadius: '16px', 
                        border: '1px solid rgba(0,0,0,0.02)' 
                    }}>
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem', 
                            marginBottom: '0.75rem',
                            fontSize: '0.75rem', 
                            fontWeight: 800, 
                            color: 'var(--text-muted)', 
                            textTransform: 'uppercase', 
                            letterSpacing: '0.1em' 
                        }}>
                            💡 Expert Pro Tips
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '1.2rem', listStyle: 'none' }}>
                            {tips.map((tip, j) => (
                                <li key={j} style={{ 
                                    marginBottom: '0.5rem', 
                                    fontSize: '0.9rem', 
                                    color: 'var(--text-primary)',
                                    position: 'relative'
                                }}>
                                    <span style={{ position: 'absolute', left: '-1.2rem', color: '#94a3b8' }}>•</span>
                                    {tip}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
};

const GuidePage = () => {
    const [openIndex, setOpenIndex] = useState(0);

    const features = [
        {
            icon: <HiOutlineSparkles />,
            title: "A - Smart AI Assistant",
            description: "Deep, data-driven financial insights powered by Google Gemini. Your advisor understands your context securely.",
            subFeatures: [
                { name: "Context Selection", desc: "Choose timeframe (Today/Week/Month) for precise analysis." },
                { name: "Dynamic Querying", desc: "Ask specific questions about any transaction or trend." },
                { name: "Automated Reports", desc: "AI generates monthly health scores and summaries." }
            ],
            tips: ["Ask: 'How much did I spend at Starbucks this month?'", "Use 'Analyze My Finances' for a full breakdown."]
        },
        {
            icon: <HiOutlinePresentationChartLine />,
            title: "B - Dashboard & Daily Pacing",
            description: "Real-time visualization of your daily spending habits compared to your long-term averages.",
            subFeatures: [
                { name: "Monthly Trends", desc: "60-month historical view of income vs expenses." },
                { name: "Category Split", desc: "Interactive pie charts showing your sector-wise spending." },
                { name: "Daily Line Graph", desc: "Track day-by-day spend to catch spikes early." }
            ],
            tips: ["Watch the 'Daily Pacing' card to see if you're on track.", "Hover over charts for exact ₹ values."]
        },
        {
            icon: <HiOutlineCreditCard />,
            title: "C - Transaction Management",
            description: "Detailed logging and filtering of every rupee you spend or earn.",
            subFeatures: [
                { name: "Specific Date Filter", desc: "Jump to any exact date in your 5-year history." },
                { name: "Dynamic Categories", desc: "Assign every expense to a custom sector." },
                { name: "Pagination", desc: "Infinite scroll handling for thousands of records." }
            ],
            tips: ["Use the search or date filter to find old receipts.", "Deleting a category will move its expenses to 'Others'."]
        },
        {
            icon: <HiOutlineBanknotes />,
            title: "D - Budgeting & Allocations",
            description: "Set strict or flexible limits for your categories to prevent overspending before it happens.",
            subFeatures: [
                { name: "Income-Based Budget", desc: "Set your central monthly income target." },
                { name: "Category Pacing", desc: "Red/Green indicators show if you're over category limits." },
                { name: "Savings Target", desc: "Unallocated income is tracked as your savings goal." }
            ],
            tips: ["Check budget progress at least once a week.", "Set small buffers for 'Others' category."]
        },
        {
            icon: <HiOutlineShieldCheck />,
            title: "E - Category Personalization",
            description: "Customize the software to match your lifestyle by defining your own spending sectors.",
            subFeatures: [
                { name: "Color Palette", desc: "Choose from 25+ distinct, professional colors." },
                { name: "Custom Naming", desc: "Create sectors like 'Gaming', 'Pet Care', or 'Business'." }
            ],
            tips: ["Cooler colors (Blue/Green) for essentials, Warmer (Red/Rose) for luxuries.", "Keep sector names short for better chart display."]
        },
        {
            icon: <HiOutlineChartBar />,
            title: "F - Savings & Wealth Trends",
            description: "Monitor your wealth accumulation journey with net accumulation tracking.",
            subFeatures: [
                { name: "Savings Rate", desc: "Calculates % efficiency of your monthly surplus." },
                { name: "Historical Breakdown", desc: "Table view of your net worth growth over years." }
            ],
            tips: ["Aim for 'Green' efficiency status (20%+ savings).", "The graph auto-scrolls to show your most recent success."]
        }
    ];

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1rem 5rem' }}>
            {/* Header Section */}
            <div className="page-header" style={{ textAlign: 'center', marginBottom: '4rem', animation: 'fadeIn 0.6s ease' }}>
                <div style={{ 
                    width: '70px', 
                    height: '70px', 
                    background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))', 
                    borderRadius: '20px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: '2rem', 
                    margin: '0 auto 1.5rem',
                    boxShadow: '0 10px 25px rgba(59, 130, 246, 0.3)',
                    color: 'white'
                }}>
                    <HiOutlineSparkles />
                </div>
                <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1rem', letterSpacing: '-0.02em' }}>
                    Feature Guide (A to Z)
                </h1>
                <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
                    Master your financial intelligence with our comprehensive suite of tools. Click on any section below to learn more about its capabilities.
                </p>
            </div>

            {/* Accordion Container */}
            <div style={{ animation: 'slideUp 0.6s ease' }}>
                {features.map((feature, i) => (
                    <AccordionItem 
                        key={i}
                        {...feature}
                        isOpen={openIndex === i}
                        onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
                    />
                ))}
            </div>

            {/* Footer Tip */}
            <div style={{ 
                marginTop: '4rem', 
                padding: '2rem', 
                borderRadius: '24px', 
                background: '#f8fafc', 
                border: '1px solid #e2e8f0',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    Need more help? Check out our <strong>Interactive Tutorials</strong> or ask the <strong>AI Assistant</strong>!
                </div>
            </div>
        </div>
    );
};

export default GuidePage;
