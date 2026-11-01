import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const DailyExpenseChart = ({ dailySpending = [], currentMonth }) => {
    // Generate all days for the current month
    const getDaysInMonth = () => {
        if (!currentMonth) return [];
        const [year, month] = currentMonth.split('-').map(Number);
        const daysCount = new Date(year, month, 0).getDate();
        
        const days = [];
        for (let i = 1; i <= daysCount; i++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            days.push(dateStr);
        }
        return days;
    };

    const allDays = getDaysInMonth();
    
    // Create map for easy lookup
    const spendingMap = dailySpending.reduce((acc, curr) => {
        acc[curr.day] = curr.total;
        return acc;
    }, {});

    const labels = allDays.map(day => {
        const d = parseInt(day.split('-')[2]);
        return d; // Just show day number for better density
    });

    const chartData = allDays.map(day => spendingMap[day] || 0);

    if (allDays.length === 0 && dailySpending.length === 0) {
        return (
            <div className="chart-card">
                <h3>📆 Daily Expenses</h3>
                <div className="empty-state" style={{ padding: '2rem 0' }}>
                    <div className="empty-state-icon">📆</div>
                    <p>No daily spending data yet</p>
                </div>
            </div>
        );
    }

    const data = {
        labels,
        datasets: [{
            label: 'Daily Spending',
            data: chartData,
            borderColor: '#10b981',
            backgroundColor: (ctx) => {
                const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 280);
                gradient.addColorStop(0, 'rgba(16, 185, 129, 0.18)');
                gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
                return gradient;
            },
            fill: true,
            tension: 0.3,
            borderWidth: 2.5,
            pointRadius: (ctx) => (ctx.raw > 0 ? 4 : 0), // Hide points for zero spending for cleaner look
            pointBackgroundColor: '#10b981',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointHoverRadius: 6,
            pointHoverBorderWidth: 3
        }]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#1e293b',
                titleColor: '#f1f5f9',
                bodyColor: '#e2e8f0',
                borderColor: '#334155',
                borderWidth: 1,
                cornerRadius: 8,
                padding: 12,
                titleFont: { family: 'Inter', weight: '600' },
                bodyFont: { family: 'Inter' },
                callbacks: {
                    title: (ctx) => `Day ${ctx[0].label} of Month`,
                    label: (ctx) => ` ₹${ctx.parsed.y.toLocaleString('en-IN')}`
                }
            }
        },
        scales: {
            x: {
                grid: { color: '#f1f5f9', drawBorder: false },
                ticks: {
                    color: '#64748b',
                    font: { family: 'Inter', size: 10 },
                    autoSkip: true,
                    maxTicksLimit: 15
                },
                title: {
                    display: true,
                    text: 'Day of Month',
                    font: { family: 'Inter', size: 10, weight: '600' },
                    color: 'var(--text-muted)'
                }
            },
            y: {
                grid: { color: '#f1f5f9', drawBorder: false },
                ticks: {
                    color: '#64748b',
                    font: { family: 'Inter', size: 11 },
                    callback: (val) => '₹' + (val >= 1000 ? (val / 1000) + 'k' : val)
                },
                beginAtZero: true
            }
        }
    };

    return (
        <div className="chart-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0 }}>📆 Daily Expenses</h3>
                {currentMonth && (
                    <span style={{ 
                        fontSize: '0.85rem', 
                        fontWeight: 700, 
                        color: 'var(--text-muted)',
                        background: '#f1f5f9',
                        padding: '0.2rem 0.75rem',
                        borderRadius: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.02em'
                    }}>
                        {new Date(currentMonth + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                    </span>
                )}
            </div>
            <div className="chart-container">
                <Line data={data} options={options} />
            </div>
        </div>
    );
};

export default DailyExpenseChart;
