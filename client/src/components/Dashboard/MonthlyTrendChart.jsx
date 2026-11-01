import { Line } from 'react-chartjs-2';
import { useRef, useEffect } from 'react';
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

const MonthlyTrendChart = ({ trends = [] }) => {
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
    }, [trends]);

    if (trends.length === 0) {
        return (
            <div className="chart-card">
                <h3>📈 Monthly Spending Trend</h3>
                <div className="empty-state" style={{ padding: '2rem 0' }}>
                    <div className="empty-state-icon">📈</div>
                    <p>Not enough data for trends</p>
                </div>
            </div>
        );
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let lastYear = null;
    
    const labels = trends.map(t => {
        const [y, m] = t.month.split('-');
        const monthName = monthNames[parseInt(m) - 1];
        
        // Show year only if it changes or it is the first label
        if (y !== lastYear) {
            lastYear = y;
            return `${monthName} ${y}`;
        }
        return monthName;
    });

    const data = {
        labels,
        datasets: [{
            label: 'Spending',
            data: trends.map(t => t.total),
            borderColor: '#3b82f6',
            backgroundColor: (ctx) => {
                const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 280);
                gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
                gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
                return gradient;
            },
            fill: true,
            tension: 0.4,
            borderWidth: 2.5,
            pointRadius: 5,
            pointBackgroundColor: '#3b82f6',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointHoverRadius: 7,
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
                    label: (ctx) => ` ₹${ctx.parsed.y.toLocaleString('en-IN')}`
                }
            }
        },
        scales: {
            x: {
                grid: { color: '#f1f5f9', drawBorder: false },
                ticks: { 
                    color: '#64748b', 
                    font: { family: 'Inter', size: 11 },
                    maxRotation: 0,
                    autoSkip: false // Don't skip labels when scrolling is enabled
                }
            },
            y: {
                grid: { color: '#f1f5f9', drawBorder: false },
                ticks: {
                    color: '#64748b',
                    font: { family: 'Inter', size: 11 },
                    callback: (val) => '₹' + (val >= 1000 ? (val / 1000) + 'k' : val)
                }
            }
        }
    };

    // Calculate dynamic width to trigger scrolling
    // Roughly 80px per month point
    const minWidth = Math.max(100, trends.length * 80);

    return (
        <div className="chart-card">
            <h3 style={{ marginBottom: '1.5rem' }}>📈 Monthly Spending Trend</h3>
            <div 
                className="chart-scroll-container" 
                ref={scrollRef}
                style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: '10px' }}
            >
                <div style={{ minWidth: `${minWidth}px`, height: '280px' }}>
                    <Line data={data} options={options} />
                </div>
            </div>
            {trends.length > 6 && (
                <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    ← Scroll to see history →
                </div>
            )}
        </div>
    );
};

export default MonthlyTrendChart;
