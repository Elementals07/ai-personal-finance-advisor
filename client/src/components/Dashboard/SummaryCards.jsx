import { useState } from 'react';
import { 
    HiOutlineWallet, 
    HiOutlineArrowTrendingDown, 
    HiOutlineBanknotes, 
    HiOutlineChartBar, 
    HiOutlinePencilSquare, 
    HiOutlineCheck,
    HiOutlineXMark
} from 'react-icons/hi2';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const SummaryCards = ({ summary, budget, onIncomeUpdate }) => {
    const { user } = useAuth();
    const [isEditingIncome, setIsEditingIncome] = useState(false);
    const [incomeInput, setIncomeInput] = useState('');
    const [saving, setSaving] = useState(false);

    const totalSpending = summary?.totalSpending || 0;
    const monthlyIncome = summary?.monthlyIncome || 0;
    const savings = monthlyIncome - totalSpending;
    const savingsRate = monthlyIncome > 0 ? Math.round((savings / monthlyIncome) * 100) : 0;
    const budgetAmount = budget?.budgetAmount || 0;
    const budgetRemaining = budgetAmount > 0 ? budgetAmount - totalSpending : 0;
    const budgetUsedPct = budgetAmount > 0 ? Math.min(100, Math.round((totalSpending / budgetAmount) * 100)) : 0;
    const monthChange = summary?.monthOverMonthChange;

    const formatCurrency = (val) => {
        return '₹' + Math.abs(val).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    };

    const handleEditSave = async () => {
        if (!incomeInput || isNaN(incomeInput) || Number(incomeInput) < 0) {
            toast.error("Please enter a valid amount");
            return;
        }

        setSaving(true);
        try {
            await API.put('/auth/profile', {
                name: user.name,
                monthly_income: parseFloat(incomeInput)
            });
            
            setIsEditingIncome(false);
            if (onIncomeUpdate) {
                onIncomeUpdate(parseFloat(incomeInput));
            }
            toast.success("Income updated successfully");
        } catch (error) {
            toast.error("Failed to update income");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="summary-cards">
            {/* Card 1: Monthly Income */}
            <div className="summary-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div className="summary-card-icon">
                        <HiOutlineWallet />
                    </div>
                    {!isEditingIncome && (
                        <button 
                            type="button"
                            className="btn-icon" 
                            onClick={() => { setIsEditingIncome(true); setIncomeInput(monthlyIncome.toString()); }} 
                            title="Edit Monthly Income"
                            style={{ width: '28px', height: '28px', fontSize: '0.85rem' }}
                        >
                            <HiOutlinePencilSquare />
                        </button>
                    )}
                </div>

                <div className="summary-card-label">Monthly Income</div>
                
                {isEditingIncome ? (
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', alignItems: 'center' }}>
                        <input 
                            type="number" 
                            value={incomeInput} 
                            onChange={(e) => setIncomeInput(e.target.value)}
                            style={{ 
                                padding: '0.35rem 0.6rem', 
                                fontSize: '0.95rem', 
                                fontWeight: 700, 
                                borderRadius: '8px',
                                background: '#ffffff',
                                borderColor: 'var(--color-primary)'
                            }}
                            autoFocus
                            placeholder="Amount in ₹"
                        />
                        <button 
                            type="button"
                            className="btn btn-primary" 
                            style={{ padding: '0.4rem 0.6rem', minWidth: '32px' }} 
                            onClick={handleEditSave} 
                            disabled={saving}
                            title="Save"
                        >
                            {saving ? <span className="spinner" style={{ width: '12px', height: '12px' }} /> : <HiOutlineCheck />}
                        </button>
                        <button 
                            type="button"
                            className="btn btn-secondary" 
                            style={{ padding: '0.4rem 0.6rem', minWidth: '32px' }} 
                            onClick={() => setIsEditingIncome(false)}
                            title="Cancel"
                        >
                            <HiOutlineXMark />
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="summary-card-value">{formatCurrency(monthlyIncome)}</div>
                        <div style={{ 
                            fontSize: '0.75rem', 
                            color: 'var(--text-muted)', 
                            marginTop: '0.5rem', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.35rem' 
                        }}>
                            <span style={{ 
                                display: 'inline-block', 
                                width: '6px', 
                                height: '6px', 
                                borderRadius: '50%', 
                                background: '#3b82f6' 
                            }} />
                            Base cash inflow
                        </div>
                    </>
                )}
            </div>

            {/* Card 2: Total Spending */}
            <div className="summary-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div className="summary-card-icon">
                        <HiOutlineArrowTrendingDown />
                    </div>
                    {monthChange !== null && monthChange !== undefined && (
                        <span className={`summary-card-change ${monthChange > 0 ? 'positive' : 'negative'}`}>
                            {monthChange > 0 ? '↑' : '↓'} {Math.abs(monthChange)}% MoM
                        </span>
                    )}
                </div>

                <div className="summary-card-label">Total Outflow</div>
                <div className="summary-card-value" style={{ color: '#0f172a' }}>
                    {formatCurrency(totalSpending)}
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    {monthlyIncome > 0 ? (
                        <span>{Math.round((totalSpending / monthlyIncome) * 100)}% of monthly income</span>
                    ) : (
                        <span>Current period expenses</span>
                    )}
                </div>
            </div>

            {/* Card 3: Net Savings */}
            <div className="summary-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div className="summary-card-icon">
                        <HiOutlineBanknotes />
                    </div>
                    {monthlyIncome > 0 && (
                        <span style={{ 
                            fontSize: '0.72rem', 
                            fontWeight: 700, 
                            padding: '0.2rem 0.55rem', 
                            borderRadius: '20px',
                            background: savings >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            color: savings >= 0 ? '#059669' : '#dc2626'
                        }}>
                            {savings >= 0 ? `+${savingsRate}% saved` : 'Deficit'}
                        </span>
                    )}
                </div>

                <div className="summary-card-label">Net Surplus / Savings</div>
                <div 
                    className="summary-card-value" 
                    style={{ color: savings >= 0 ? '#059669' : '#dc2626' }}
                >
                    {savings >= 0 ? '+' : '-'}{formatCurrency(savings)}
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    {savings >= 0 ? 'Retained capital' : 'Excess expenditure'}
                </div>
            </div>

            {/* Card 4: Budget Status */}
            <div className="summary-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div className="summary-card-icon">
                        <HiOutlineChartBar />
                    </div>
                    {budgetAmount > 0 && (
                        <span style={{ 
                            fontSize: '0.72rem', 
                            fontWeight: 700, 
                            padding: '0.2rem 0.55rem', 
                            borderRadius: '20px',
                            background: budgetRemaining >= 0 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            color: budgetRemaining >= 0 ? '#d97706' : '#dc2626'
                        }}>
                            {budgetUsedPct}% used
                        </span>
                    )}
                </div>

                <div className="summary-card-label">Budget Remaining</div>
                <div 
                    className="summary-card-value" 
                    style={{ color: budgetRemaining >= 0 ? '#d97706' : '#dc2626' }}
                >
                    {budgetAmount > 0 ? (
                        <>{budgetRemaining >= 0 ? '' : '-'}{formatCurrency(budgetRemaining)}</>
                    ) : (
                        <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Not configured</span>
                    )}
                </div>

                {budgetAmount > 0 ? (
                    <div style={{ marginTop: '0.65rem' }}>
                        <div style={{ 
                            height: '5px', 
                            background: '#e2e8f0', 
                            borderRadius: '3px', 
                            overflow: 'hidden' 
                        }}>
                            <div style={{ 
                                height: '100%', 
                                width: `${budgetUsedPct}%`, 
                                background: budgetUsedPct > 90 ? '#ef4444' : budgetUsedPct > 75 ? '#f59e0b' : '#3b82f6',
                                borderRadius: '3px',
                                transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
                            }} />
                        </div>
                    </div>
                ) : (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        Set limit in Budget section
                    </div>
                )}
            </div>
        </div>
    );
};

export default SummaryCards;
