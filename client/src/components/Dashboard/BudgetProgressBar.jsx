const BudgetProgressBar = ({ budget, currentMonth, onMonthChange }) => {

    if (!budget || !budget.hasBudget) {
        return (
            <div className="chart-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3>🎯 Budget Progress</h3>
                </div>
                <div className="empty-state" style={{ padding: '2rem 0' }}>
                    <div className="empty-state-icon">🎯</div>
                    <p>No budget set for this month</p>
                </div>
            </div>
        );
    }

    const { budgetAmount, totalSpent, remaining, percentUsed } = budget;
    const clampedPercent = Math.min(percentUsed, 100);

    let barClass = '';
    if (percentUsed >= 100) barClass = 'danger';
    else if (percentUsed >= 75) barClass = 'warning';

    const formatCurrency = (val) => '₹' + Math.abs(val).toLocaleString('en-IN', { maximumFractionDigits: 0 });

    return (
        <div className="chart-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3>🎯 Budget Progress</h3>
            </div>
            <div style={{ padding: '1rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {percentUsed}% used
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: percentUsed >= 100 ? '#ef4444' : 'var(--text-muted)' }}>
                        {percentUsed >= 100 ? '⚠️ Over Budget!' : `${formatCurrency(remaining)} left`}
                    </span>
                </div>

                <div className="progress-bar-container">
                    <div
                        className={`progress-bar ${barClass}`}
                        style={{ width: `${clampedPercent}%` }}
                    />
                </div>

                <div className="budget-stats">
                    <div>
                        Spent: <span className="amount">{formatCurrency(totalSpent)}</span>
                    </div>
                    <div>
                        Budget: <span className="amount">{formatCurrency(budgetAmount)}</span>
                    </div>
                </div>
            </div>

            {budget.categoryBreakdown && budget.categoryBreakdown.length > 0 && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                        Category Allocations
                    </div>
                    <div style={{ 
                        maxHeight: '280px', 
                        overflowY: 'auto', 
                        paddingRight: '12px',
                        marginTop: '0.5rem',
                        scrollbarWidth: 'thin',
                        scrollbarColor: 'var(--border-color) transparent'
                    }} className="custom-scrollbar">
                        {budget.categoryBreakdown.map((cat) => {
                            const catBudget = budget.allocations ? budget.allocations[cat.category] : 0;
                            const catPercent = catBudget > 0 ? Math.round((cat.total / catBudget) * 100) : 0;
                            const clampedCatPercent = Math.min(catPercent, 100);
                            
                            let catBarClass = '';
                            if (catPercent >= 100) catBarClass = 'danger';
                            else if (catPercent >= 75) catBarClass = 'warning';

                            return (
                                <div key={cat.category} style={{ marginBottom: '1.25rem' }}>
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        marginBottom: '0.4rem', fontSize: '0.85rem'
                                    }}>
                                        <span className={`category-badge ${cat.category.toLowerCase()}`} style={{ fontWeight: 600 }}>
                                            {cat.category}
                                        </span>
                                        {catBudget > 0 ? (
                                            <span style={{ color: catPercent >= 100 ? '#ef4444' : 'var(--text-secondary)', fontWeight: 600 }}>
                                                {formatCurrency(cat.total)} / {formatCurrency(catBudget)} ({catPercent}%)
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                                                {formatCurrency(cat.total)}
                                            </span>
                                        )}
                                    </div>
                                    {catBudget > 0 && (
                                        <div className="progress-bar-container" style={{ height: '7px', marginBottom: '0' }}>
                                            <div
                                                className={`progress-bar ${catBarClass}`}
                                                style={{ width: `${clampedCatPercent}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default BudgetProgressBar;
