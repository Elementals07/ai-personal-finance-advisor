import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { useCategories } from '../../hooks/useCategories';

ChartJS.register(ArcElement, Tooltip, Legend);

const SpendingPieChart = ({ categoryBreakdown = [] }) => {
    const { colorMap } = useCategories();

    if (categoryBreakdown.length === 0) {
        return (
            <div className="chart-card">
                <h3>📊 Category Breakdown</h3>
                <div className="empty-state" style={{ padding: '2rem 0' }}>
                    <div className="empty-state-icon">📊</div>
                    <p>No spending data yet</p>
                </div>
            </div>
        );
    }

    const data = {
        labels: categoryBreakdown.map(c => c.category),
        datasets: [{
            data: categoryBreakdown.map(c => c.total),
            backgroundColor: categoryBreakdown.map(c => colorMap[c.category] || '#64748b'),
            borderColor: '#ffffff',
            borderWidth: 2,
            hoverOffset: 8,
            spacing: 2,
            borderRadius: 4
        }]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
            legend: {
                position: 'right',
                labels: {
                    color: '#475569',
                    font: { family: 'Inter', size: 12, weight: '500' },
                    padding: 12,
                    usePointStyle: true,
                    pointStyleWidth: 10
                }
            },
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
                    label: (ctx) => {
                        const value = ctx.parsed;
                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                        const pct = Math.round((value / total) * 100);
                        return ` ₹${value.toLocaleString('en-IN')} (${pct}%)`;
                    }
                }
            }
        }
    };

    return (
        <div className="chart-card">
            <h3>📊 Category Breakdown</h3>
            <div className="chart-container">
                <Doughnut data={data} options={options} />
            </div>
        </div>
    );
};

export default SpendingPieChart;
