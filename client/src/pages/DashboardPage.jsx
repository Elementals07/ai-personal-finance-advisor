import { useState, useEffect } from 'react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import SummaryCards from '../components/Dashboard/SummaryCards';
import SpendingPieChart from '../components/Dashboard/SpendingPieChart';
import MonthlyTrendChart from '../components/Dashboard/MonthlyTrendChart';
import DailyExpenseChart from '../components/Dashboard/DailyExpenseChart';
import BudgetProgressBar from '../components/Dashboard/BudgetProgressBar';
import toast from 'react-hot-toast';

const DashboardPage = () => {
    const { user } = useAuth();
    const [summary, setSummary] = useState(null);
    const [budget, setBudget] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    useEffect(() => {
        fetchDashboardData();
    }, [currentMonth]); // Re-fetch when month changes

    const handleMonthChange = (e) => {
        setCurrentMonth(e.target.value);
    };

    // Generate month options (last 24 months + next 6 months for budgeting)
    const generateMonthOptions = () => {
        const options = [];
        const now = new Date();
        for (let i = -60; i <= 6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
            options.push({ val, label });
        }
        return options;
    };

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            const [summaryRes, budgetRes] = await Promise.all([
                API.get(`/expenses/summary?month=${currentMonth}`),
                API.get(`/budgets?month=${currentMonth}`)
            ]);
            setSummary({
                ...summaryRes.data.data,
                monthlyIncome: user?.monthly_income || 0
            });
            setBudget(budgetRes.data.data);
        } catch (err) {
            toast.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    };

    const firstName = user?.name?.split(' ')[0] || 'there';

    const monthLabel = new Date(currentMonth + '-01').toLocaleDateString('en-IN', {
        month: 'long', year: 'numeric'
    });

    if (loading) {
        return (
            <div>
                <div className="page-header">
                    <h1>Dashboard</h1>
                    <p>Loading your financial overview...</p>
                </div>
                <div className="summary-cards">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="summary-card">
                            <div className="loading-skeleton" style={{ width: '40px', height: '40px', borderRadius: '12px' }} />
                            <div className="loading-skeleton" style={{ width: '60%', height: '14px', marginTop: '1rem' }} />
                            <div className="loading-skeleton" style={{ width: '40%', height: '28px', marginTop: '0.5rem' }} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <div style={{ 
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)', 
                        border: '1px solid #dbeafe', borderRadius: '20px',
                        padding: '0.25rem 0.85rem', fontSize: '0.75rem', fontWeight: 700,
                        color: '#2563eb', marginBottom: '0.75rem', letterSpacing: '0.03em'
                    }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 6px rgba(16,185,129,0.5)' }} />
                        LIVE DASHBOARD
                    </div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.25rem' }}>
                        {getGreeting()}, {firstName} 👋
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Financial overview · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'white', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '0.5rem 0.75rem', boxShadow: 'var(--shadow-sm)' }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Period</label>
                    <select 
                        value={currentMonth} 
                        onChange={handleMonthChange}
                        style={{ 
                            padding: '0.4rem 2.25rem 0.4rem 0.75rem', 
                            borderRadius: '8px', 
                            width: 'auto',
                            fontWeight: 600,
                            background: '#f8fafc',
                            borderColor: 'var(--border-color)',
                            fontSize: '0.875rem',
                            color: 'var(--text-primary)'
                        }}
                    >
                        {generateMonthOptions().map(opt => (
                            <option key={opt.val} value={opt.val}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Summary Cards */}
            <SummaryCards summary={summary} budget={budget} onIncomeUpdate={fetchDashboardData} />

            {/* Charts Row 1: Category Pie + Monthly Trend */}
            <div className="charts-grid">
                <SpendingPieChart categoryBreakdown={summary?.categoryBreakdown || []} />
                <MonthlyTrendChart trends={summary?.trends || []} />
            </div>

            {/* Charts Row 2: Daily Expense + Budget Progress */}
            <div className="charts-grid">
                <DailyExpenseChart dailySpending={summary?.dailySpending || []} currentMonth={currentMonth} />
                <BudgetProgressBar budget={budget} currentMonth={currentMonth} onMonthChange={setCurrentMonth} />
            </div>
        </div>
    );
};

export default DashboardPage;
