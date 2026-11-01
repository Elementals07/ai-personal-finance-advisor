import { useState, useEffect, useRef } from 'react';
import API from '../api/axios';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement
} from 'chart.js';
import { HiOutlineBanknotes, HiOutlineArrowTrendingUp, HiOutlineSparkles } from 'react-icons/hi2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const SavingsPage = () => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef(null);

    useEffect(() => {
        const fetchSavings = async () => {
            try {
                const res = await API.get('/expenses/savings');
                setHistory(res.data.data);
            } catch (err) {
                console.error('Failed to fetch savings history', err);
            } finally {
                setLoading(false);
            }
        };
        fetchSavings();
    }, []);

    // Auto-scroll to the end (most recent data) when history loads
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
    }, [history]);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let lastYear = null;

    const reversedHistory = [...history].reverse();
    const labels = reversedHistory.map(h => {
        const [y, m] = h.month.split('-');
        const monthName = monthNames[parseInt(m) - 1];
        if (y !== lastYear) {
            lastYear = y;
            return `${monthName} ${y}`;
        }
        return monthName;
    });

    const chartData = {
        labels,
        datasets: [
            {
                label: 'Monthly Inflow',
                data: reversedHistory.map(h => h.income),
                backgroundColor: 'rgba(59, 130, 246, 0.75)',
                borderColor: '#3b82f6',
                borderWidth: 1,
                borderRadius: 6
            },
            {
                label: 'Monthly Outflow',
                data: reversedHistory.map(h => h.spent),
                backgroundColor: 'rgba(239, 68, 68, 0.75)',
                borderColor: '#ef4444',
                borderWidth: 1,
                borderRadius: 6
            }
        ]
    };

    const totalSavings = history.reduce((sum, h) => sum + h.savings, 0);
    const avgSavings = history.length > 0 ? Math.round(totalSavings / history.length) : 0;
    const bestMonth = history.length > 0 
        ? history.reduce((max, h) => h.savings > max.savings ? h : max, history[0])
        : null;

    const minWidth = Math.max(100, reversedHistory.length * 75);

    return (
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div className="page-header" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.25rem 0.85rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, color: '#065f46', marginBottom: '0.75rem' }}>
                    <HiOutlineSparkles /> WEALTH ACCUMULATION
                </div>
                <h1>Savings & Net Worth Trajectory</h1>
                <p>Track cash inflows, retained surpluses, and capital growth month-over-month</p>
            </div>

            {/* Top 3 KPI stats */}
            <div className="summary-cards" style={{ marginBottom: '2rem' }}>
                <div className="summary-card">
                    <div className="summary-card-icon" style={{ background: '#ecfdf5', color: '#10b981' }}>
                        <HiOutlineBanknotes />
                    </div>
                    <div className="summary-card-label">Net Accumulated Surplus</div>
                    <div className="summary-card-value" style={{ color: totalSavings >= 0 ? '#059669' : '#dc2626' }}>
                        {totalSavings >= 0 ? '+' : '-'}₹{Math.abs(totalSavings).toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        Across all tracked months
                    </div>
                </div>

                <div className="summary-card">
                    <div className="summary-card-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}>
                        <HiOutlineArrowTrendingUp />
                    </div>
                    <div className="summary-card-label">Average Monthly Retention</div>
                    <div className="summary-card-value" style={{ color: avgSavings >= 0 ? '#2563eb' : '#dc2626' }}>
                        {avgSavings >= 0 ? '+' : '-'}₹{Math.abs(avgSavings).toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        Monthly run-rate savings
                    </div>
                </div>

                <div className="summary-card">
                    <div className="summary-card-icon" style={{ background: '#fffbeb', color: '#d97706' }}>
                        <HiOutlineSparkles />
                    </div>
                    <div className="summary-card-label">Peak Performance Month</div>
                    <div className="summary-card-value" style={{ color: '#d97706', fontSize: '1.4rem' }}>
                        {bestMonth ? `+₹${bestMonth.savings.toLocaleString('en-IN')}` : '—'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        {bestMonth ? `Achieved in ${bestMonth.month}` : 'Pending data'}
                    </div>
                </div>
            </div>

            {/* Chart Card */}
            <div className="chart-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>📊 Inflow vs Outflow Comparison</h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Interactive scrollable history
                    </div>
                </div>
                
                {loading ? (
                    <div className="loading-skeleton" style={{ height: '320px', borderRadius: '16px' }} />
                ) : history.length === 0 ? (
                    <div className="empty-state" style={{ padding: '3rem 1rem' }}>
                        <div className="empty-state-icon">📊</div>
                        <h3>No transaction history found</h3>
                        <p>Record transactions to track historical income and spending.</p>
                    </div>
                ) : (
                    <div 
                        className="chart-scroll-container" 
                        ref={scrollRef}
                        style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: '12px' }}
                    >
                        <div style={{ minWidth: `${minWidth}px`, height: '340px' }}>
                            <Bar 
                                data={chartData} 
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    scales: {
                                        y: {
                                            beginAtZero: true,
                                            grid: { color: '#f1f5f9' },
                                            ticks: { 
                                                callback: (val) => '₹' + (val >= 1000 ? (val / 1000) + 'k' : val),
                                                font: { family: 'Inter', size: 11 },
                                                color: '#64748b'
                                            }
                                        },
                                        x: { 
                                            grid: { display: false },
                                            ticks: {
                                                font: { family: 'Inter', size: 11 },
                                                color: '#64748b',
                                                autoSkip: false
                                            }
                                        }
                                    },
                                    plugins: {
                                        legend: { 
                                            position: 'top',
                                            labels: { font: { family: 'Inter', weight: 600 }, color: '#334155' }
                                        },
                                        tooltip: {
                                            padding: 12,
                                            backgroundColor: '#0f172a',
                                            cornerRadius: 8,
                                            titleFont: { family: 'Inter', weight: 700 },
                                            bodyFont: { family: 'Inter' }
                                        }
                                    }
                                }} 
                            />
                        </div>
                    </div>
                )}
                {history.length > 8 && (
                    <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                        ← Scroll horizontally to inspect earlier months →
                    </div>
                )}
            </div>

            {/* Table Card */}
            <div className="card" style={{ padding: '2rem', borderRadius: '24px' }}>
                <div style={{ marginBottom: '1.75rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                        Detailed Monthly Audit
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                        Month-by-month financial retention and savings efficiency rates
                    </p>
                </div>
                
                <div style={{ overflowX: 'auto' }}>
                    <table className="expense-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Month</th>
                                <th>Income Inflow</th>
                                <th>Total Outflow</th>
                                <th>Net Savings</th>
                                <th>Efficiency</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i}>
                                        <td colSpan="5" className="loading-skeleton" style={{ height: '44px', margin: '6px 0' }} />
                                    </tr>
                                ))
                            ) : history.length === 0 ? (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                                        No data available
                                    </td>
                                </tr>
                            ) : (
                                history.map(row => {
                                    const savedPct = row.income > 0 ? Math.round((row.savings / row.income) * 100) : 0;
                                    return (
                                        <tr key={row.month}>
                                            <td style={{ fontWeight: 800, color: '#3b82f6' }}>{row.month}</td>
                                            <td style={{ fontWeight: 600 }}>₹{row.income.toLocaleString('en-IN')}</td>
                                            <td style={{ color: '#64748b', fontWeight: 600 }}>₹{row.spent.toLocaleString('en-IN')}</td>
                                            <td style={{ fontWeight: 800, color: row.savings >= 0 ? '#059669' : '#dc2626' }}>
                                                {row.savings >= 0 ? '+' : ''}₹{row.savings.toLocaleString('en-IN')}
                                            </td>
                                            <td>
                                                <span 
                                                    style={{ 
                                                        padding: '0.25rem 0.65rem', 
                                                        borderRadius: '20px', 
                                                        background: savedPct >= 20 ? 'rgba(16, 185, 129, 0.12)' : savedPct > 0 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                        color: savedPct >= 20 ? '#059669' : savedPct > 0 ? '#d97706' : '#dc2626',
                                                        fontSize: '0.78rem',
                                                        fontWeight: 700
                                                    }}
                                                >
                                                    {savedPct}% saved
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SavingsPage;
