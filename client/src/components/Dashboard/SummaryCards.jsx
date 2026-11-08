import { useState } from 'react';
import { 
    HiOutlineWallet, 
    HiOutlineArrowTrendingDown, 
    HiOutlineBanknotes, 
    HiOutlinePencilSquare, 
    HiOutlineCheck,
    HiOutlineXMark,
    HiOutlineScale
} from 'react-icons/hi2';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const SummaryCards = ({ summary, budget, onIncomeUpdate }) => {
    const { user, updateUser } = useAuth();
    const [isEditingIncome, setIsEditingIncome] = useState(false);
    const [incomeInput, setIncomeInput] = useState('');
    const [saving, setSaving] = useState(false);

    const totalSpending = summary?.totalSpending || 0;
    const monthlyIncome = summary?.monthlyIncome || user?.monthly_income || 0;

    // The spending plan is the sum of the category limits saved in MySQL.
    // It is deliberately different from income: income minus expenses is the
    // month's net savings, while this is the money left inside the plan.
    const plannedSpending = Number(budget?.plannedAmount) || 0;
    const hasCategoryPlan = plannedSpending > 0;
    const remainingInPlan = hasCategoryPlan ? plannedSpending - totalSpending : null;
    const isExceeded = hasCategoryPlan && remainingInPlan < 0;

    // Income minus recorded expenses (net savings, not bank balance)
    const netDifference = monthlyIncome - totalSpending;

    const formatCurrency = (val) => {
        return '₹' + Math.abs(val).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    };

    const handleEditSave = async () => {
        const num = parseFloat(incomeInput);
        if (isNaN(num) || num < 0) {
            toast.error("Please enter a valid positive number for income");
            return;
        }

        setSaving(true);
        try {
            await API.put('/auth/profile', {
                name: user?.name,
                monthly_income: num
            });
            updateUser({ monthly_income: num });
            setIsEditingIncome(false);
            if (onIncomeUpdate) {
                onIncomeUpdate(num);
            }
            toast.success("Monthly income updated");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to update income");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="summary-cards">
            {/* 1. Money Left in Category Spending Plan */}
            <div className="summary-card" style={{ borderLeft: `4px solid ${isExceeded ? 'var(--color-danger)' : 'var(--color-primary)'}` }}>
                <div className="summary-card-header">
                    <div className="summary-card-icon" style={{ backgroundColor: isExceeded ? 'var(--color-danger-subtle)' : 'var(--color-primary-subtle)', color: isExceeded ? 'var(--color-danger)' : 'var(--color-primary)' }}>
                        <HiOutlineBanknotes aria-hidden="true" />
                    </div>
                    {hasCategoryPlan ? (
                        <span className={`summary-card-tag ${isExceeded ? 'danger' : 'positive'}`}>
                            {isExceeded ? 'Over Plan' : 'Category Plan'}
                        </span>
                    ) : (
                        <span className="summary-card-tag" style={{ backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                            Not Planned
                        </span>
                    )}
                </div>
                <div className="summary-card-label">Category Budget Left</div>
                <div className="summary-card-value financial-figure" style={{ color: isExceeded ? 'var(--color-danger)' : 'var(--color-primary)' }}>
                    {hasCategoryPlan
                        ? (isExceeded ? `-${formatCurrency(remainingInPlan)}` : formatCurrency(remainingInPlan))
                        : '—'}
                </div>
                <div className="summary-card-helper">
                    {!hasCategoryPlan
                        ? 'Set category limits on the Budget page to track this.'
                        : isExceeded
                            ? `Over your category limits by ${formatCurrency(Math.abs(remainingInPlan))}`
                            : `${formatCurrency(totalSpending)} of ${formatCurrency(plannedSpending)} category limits used`}
                </div>
            </div>

            {/* 2. Monthly Income */}
            <div className="summary-card">
                <div className="summary-card-header">
                    <div className="summary-card-icon">
                        <HiOutlineWallet aria-hidden="true" />
                    </div>
                    {!isEditingIncome && (
                        <button 
                            type="button"
                            className="btn btn-outline btn-sm" 
                            onClick={() => { 
                                setIsEditingIncome(true); 
                                setIncomeInput(monthlyIncome.toString()); 
                            }} 
                            aria-label="Edit Monthly Income amount"
                            style={{ height: '32px', padding: '0 8px', fontSize: '0.78rem' }}
                        >
                            <HiOutlinePencilSquare aria-hidden="true" /> Edit
                        </button>
                    )}
                </div>

                <div className="summary-card-label">Monthly Income</div>
                
                {isEditingIncome ? (
                    <div style={{ marginTop: '0.25rem' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                            <div className="input-amount-wrapper" style={{ flex: 1 }}>
                                <span style={{ position: 'absolute', left: '8px', fontWeight: 600, color: 'var(--text-secondary)' }}>₹</span>
                                <input 
                                    type="number" 
                                    value={incomeInput} 
                                    onChange={(e) => setIncomeInput(e.target.value)}
                                    className="form-input num"
                                    style={{ paddingLeft: '1.5rem', height: '36px', fontSize: '0.95rem', fontWeight: 700 }}
                                    autoFocus
                                    placeholder="Amount"
                                    aria-label="Monthly income amount in rupees"
                                />
                            </div>
                            <button 
                                type="button"
                                className="btn btn-primary btn-sm" 
                                onClick={handleEditSave}
                                disabled={saving}
                                title="Save Income"
                                aria-label="Save Income"
                                style={{ minWidth: '36px', height: '36px', padding: '0 8px' }}
                            >
                                <HiOutlineCheck aria-hidden="true" />
                            </button>
                            <button 
                                type="button"
                                className="btn btn-outline btn-sm" 
                                onClick={() => setIsEditingIncome(false)}
                                title="Cancel"
                                aria-label="Cancel editing income"
                                style={{ minWidth: '36px', height: '36px', padding: '0 8px' }}
                            >
                                <HiOutlineXMark aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="summary-card-value financial-figure">
                        {formatCurrency(monthlyIncome)}
                    </div>
                )}
                <div className="summary-card-helper">
                    Total expected inflow for the month
                </div>
            </div>

            {/* 3. Money Spent */}
            <div className="summary-card">
                <div className="summary-card-header">
                    <div className="summary-card-icon" style={{ backgroundColor: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}>
                        <HiOutlineArrowTrendingDown aria-hidden="true" />
                    </div>
                    {summary?.transactionCount !== undefined && (
                        <span className="summary-card-tag positive">
                            {summary.transactionCount} {summary.transactionCount === 1 ? 'expense' : 'expenses'}
                        </span>
                    )}
                </div>
                <div className="summary-card-label">Money Spent</div>
                <div className="summary-card-value financial-figure" style={{ color: 'var(--color-accent)' }}>
                    {formatCurrency(totalSpending)}
                </div>
                <div className="summary-card-helper">
                    Recorded expenses in this period
                </div>
            </div>

            {/* 4. Month Savings (Income - Expenses) */}
            <div className="summary-card">
                <div className="summary-card-header">
                    <div className="summary-card-icon" style={{ backgroundColor: netDifference >= 0 ? 'var(--color-secondary)' : 'var(--color-danger-subtle)', color: netDifference >= 0 ? 'var(--color-primary)' : 'var(--color-danger)' }}>
                        <HiOutlineScale aria-hidden="true" />
                    </div>
                    <span className={`summary-card-tag ${netDifference >= 0 ? 'positive' : 'danger'}`}>
                        {netDifference >= 0 ? 'Saved' : 'Deficit'}
                    </span>
                </div>
                <div className="summary-card-label">Monthly Net Savings</div>
                <div className="summary-card-value financial-figure" style={{ color: netDifference >= 0 ? 'var(--color-primary)' : 'var(--color-danger)' }}>
                    {netDifference < 0 ? '-' : '+'}{formatCurrency(netDifference)}
                </div>
                <div className="summary-card-helper">
                    Income minus all recorded expenses (not bank account balance)
                </div>
            </div>
        </div>
    );
};

export default SummaryCards;
