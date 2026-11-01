import { useState, useEffect } from 'react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { useCategories } from '../../hooks/useCategories';
import { HiOutlineBanknotes, HiOutlineSparkles, HiOutlineCheck } from 'react-icons/hi2';

const BudgetManager = () => {
    const { categoryNames } = useCategories();
    const { user } = useAuth();
    const [budget, setBudget] = useState(null);
    const [allocationsInput, setAllocationsInput] = useState({});
    const [incomeInput, setIncomeInput] = useState('');
    const [monthInput, setMonthInput] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchBudget = async (month) => {
        setLoading(true);
        try {
            const res = await API.get(`/budgets?month=${month}`);
            setBudget(res.data.data);
            setIncomeInput(res.data.data.budgetAmount?.toString() || user?.monthly_income?.toString() || '');
            
            // Populate inputs
            const allocs = res.data.data.allocations || {};
            const initialInputs = {};
            categoryNames.forEach(c => {
                initialInputs[c] = allocs[c]?.toString() || '';
            });
            setAllocationsInput(initialInputs);
            
        } catch (err) {
            console.error('Failed to fetch budget:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBudget(monthInput);
    }, [monthInput]);

    const handleSave = async (e) => {
        e.preventDefault();
        
        setSaving(true);
        try {
            // 1. Update Monthly Income globally
            if (incomeInput && parseFloat(incomeInput) > 0) {
                await API.put('/auth/profile', {
                    name: user.name,
                    monthly_income: parseFloat(incomeInput)
                });
            }

            // 2. Build and save budget payload
            const payload = [];
            for (const [cat, val] of Object.entries(allocationsInput)) {
                if (val && parseFloat(val) > 0) {
                    payload.push({ category: cat, amount: parseFloat(val) });
                }
            }
            
            await API.post('/budgets', {
                allocations: payload,
                month: monthInput
            });
            
            toast.success('Budget & Allocations saved successfully!');
            fetchBudget(monthInput);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleInputChange = (category, value) => {
        setAllocationsInput(prev => ({
            ...prev,
            [category]: value
        }));
    };

    const percentUsed = budget?.percentUsed || 0;
    const clampedPercent = Math.min(percentUsed, 100);
    let barClass = '';
    if (percentUsed >= 100) barClass = 'danger';
    else if (percentUsed >= 75) barClass = 'warning';

    const formatCurrency = (val) => '₹' + Math.abs(val).toLocaleString('en-IN', { maximumFractionDigits: 0 });

    return (
        <div className="budget-section">
            <div className="budget-overview">
                {/* Budget Progress Card */}
                <div className="budget-progress-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span role="img" aria-label="chart">📊</span> Budget Status
                        </h3>
                        <span style={{ 
                            fontSize: '0.8rem', 
                            fontWeight: 700, 
                            color: 'var(--text-secondary)',
                            background: '#f1f5f9',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '20px'
                        }}>
                            {new Date(monthInput + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                        </span>
                    </div>

                    {loading ? (
                        <div>
                            <div className="loading-skeleton" style={{ height: '24px', marginBottom: '1rem', borderRadius: '12px' }} />
                            <div className="loading-skeleton" style={{ height: '48px', borderRadius: '12px' }} />
                            <div className="loading-skeleton" style={{ height: '120px', marginTop: '1.5rem', borderRadius: '12px' }} />
                        </div>
                    ) : budget?.hasBudget ? (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    {percentUsed}% of Income allocated
                                </span>
                                <span style={{ 
                                    fontWeight: 700, 
                                    color: percentUsed >= 100 ? '#ef4444' : percentUsed >= 75 ? '#d97706' : '#10b981' 
                                }}>
                                    {percentUsed >= 100 ? '⚠️ Exceeded Limit' : `${formatCurrency(budget.remaining)} buffer left`}
                                </span>
                            </div>

                            <div className="progress-bar-container" style={{ height: '18px', borderRadius: '9px' }}>
                                <div 
                                    className={`progress-bar ${barClass}`} 
                                    style={{ width: `${clampedPercent}%`, transition: 'width 0.8s ease' }} 
                                />
                            </div>

                            <div className="budget-stats" style={{ marginTop: '1.25rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Spent</div>
                                    <div className="amount" style={{ fontSize: '1.1rem', marginTop: '0.2rem', color: '#e11d48' }}>{formatCurrency(budget.totalSpent)}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Base Budget Income</div>
                                    <div className="amount" style={{ fontSize: '1.1rem', marginTop: '0.2rem', color: '#0284c7' }}>{formatCurrency(budget.budgetAmount)}</div>
                                </div>
                            </div>
                            
                            {/* Category breakdown vs Assigned Budgets */}
                            {budget.categoryBreakdown && budget.categoryBreakdown.length > 0 && (
                                <div style={{ marginTop: '1.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        Category Spending Breakdown
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        {budget.categoryBreakdown.map(cat => {
                                            const catBudget = budget.allocations[cat.category] || 0;
                                            const isCatOver = catBudget > 0 && cat.total > catBudget;
                                            const catPct = catBudget > 0 ? Math.round((cat.total / catBudget) * 100) : null;
                                            return (
                                                <div 
                                                    key={cat.category} 
                                                    style={{ 
                                                        display: 'flex', 
                                                        justifyContent: 'space-between', 
                                                        alignItems: 'center',
                                                        padding: '0.65rem 0.85rem', 
                                                        fontSize: '0.875rem', 
                                                        borderRadius: '10px',
                                                        background: '#ffffff',
                                                        border: '1px solid #f1f5f9'
                                                    }}
                                                >
                                                    <span className={`category-badge ${cat.category.toLowerCase()}`}>
                                                        {cat.category}
                                                    </span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <div style={{ color: isCatOver ? '#ef4444' : 'var(--text-primary)', fontWeight: 700 }}>
                                                                {formatCurrency(cat.total)}
                                                            </div>
                                                            {catBudget > 0 && (
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                    Limit: {formatCurrency(catBudget)}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {catPct !== null && (
                                                            <span style={{ 
                                                                fontSize: '0.75rem', 
                                                                fontWeight: 700, 
                                                                padding: '0.2rem 0.5rem', 
                                                                borderRadius: '6px',
                                                                background: catPct > 100 ? '#fef2f2' : catPct > 80 ? '#fffbeb' : '#f0fdf4',
                                                                color: catPct > 100 ? '#dc2626' : catPct > 80 ? '#d97706' : '#166534'
                                                            }}>
                                                                {catPct}%
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="empty-state" style={{ padding: '3rem 1rem' }}>
                            <div className="empty-state-icon">🎯</div>
                            <h3>No budget configured</h3>
                            <p>Allocate a monthly budget on the right to track your spending limits automatically.</p>
                        </div>
                    )}
                </div>

                {/* Set Budget Form */}
                <div className="budget-form-card">
                    <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <HiOutlineBanknotes style={{ color: '#3b82f6' }} /> Allocate Monthly Targets
                    </h3>
                    <form onSubmit={handleSave}>
                        <div className="form-group">
                            <label htmlFor="budget-month">Target Month</label>
                            <input
                                id="budget-month"
                                type="month"
                                value={monthInput}
                                onChange={(e) => setMonthInput(e.target.value)}
                                style={{ borderRadius: '10px' }}
                            />
                        </div>
                        
                        <div style={{ 
                            padding: '1.25rem', 
                            background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)', 
                            borderRadius: '12px', 
                            border: '1px solid #dbeafe',
                            marginBottom: '1.25rem' 
                        }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.85rem' }}>
                                    Monthly Income Base (₹)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="Total Income (e.g., 60000)"
                                    value={incomeInput}
                                    onChange={(e) => setIncomeInput(e.target.value)}
                                    style={{ 
                                        border: '2px solid #3b82f6', 
                                        borderRadius: '10px', 
                                        background: '#ffffff',
                                        fontWeight: 700,
                                        fontSize: '1.1rem'
                                    }}
                                />
                            </div>
                        </div>

                        <div>
                            <div style={{ 
                                fontSize: '0.75rem', 
                                fontWeight: 700, 
                                color: 'var(--text-muted)', 
                                marginBottom: '0.85rem', 
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em'
                            }}>
                                Category Caps (Optional)
                            </div>
                            
                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', 
                                gap: '0.75rem',
                                maxHeight: '280px', 
                                overflowY: 'auto', 
                                paddingRight: '0.5rem' 
                            }}>
                                {categoryNames.map(cat => (
                                    <div key={cat} style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                                            {cat}
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder="₹ Limit"
                                            value={allocationsInput[cat] || ''}
                                            onChange={(e) => handleInputChange(cat, e.target.value)}
                                            style={{ 
                                                padding: '0.45rem 0.6rem', 
                                                fontSize: '0.85rem',
                                                borderRadius: '8px',
                                                background: '#ffffff'
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            className="btn btn-primary" 
                            disabled={saving} 
                            style={{ width: '100%', marginTop: '1.5rem', padding: '0.85rem' }}
                        >
                            {saving ? (
                                <><span className="spinner" style={{ width: '16px', height: '16px' }} /> Saving...</>
                            ) : (
                                <><HiOutlineCheck /> Save Budget & Allocations</>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default BudgetManager;
