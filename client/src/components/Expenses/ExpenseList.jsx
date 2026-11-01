import { HiOutlinePencilSquare, HiOutlineTrash, HiOutlineXMark, HiOutlineCheck } from 'react-icons/hi2';

const CAT_COLORS = {
    food: '#f59e0b',
    travel: '#3b82f6',
    rent: '#ef4444',
    entertainment: '#8b5cf6',
    shopping: '#ec4899',
    utilities: '#06b6d4',
    health: '#10b981',
    education: '#6366f1',
    others: '#64748b',
};

const styles = `
.expense-actions { opacity: 0.3; transition: opacity 0.15s ease; }
.expense-table tbody tr:hover .expense-actions { opacity: 1; }
`;

const ExpenseList = ({ expenses = [], onEdit, onDelete, deletingId, onCancelDelete, loading }) => {

    if (loading) {
        return (
            <div className="card-body">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="loading-skeleton" style={{ height: '48px', marginBottom: '0.5rem' }} />
                ))}
            </div>
        );
    }

    if (expenses.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">📝</div>
                <h3>No expenses found</h3>
                <p>Start tracking your spending by adding your first expense.</p>
            </div>
        );
    }

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <>
            <style>{styles}</style>
            <div style={{ overflowX: 'auto' }}>
                <table className="expense-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Category</th>
                            <th>Description</th>
                            <th>Amount</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {expenses.map((exp) => {
                            const catColor = CAT_COLORS[exp.category?.toLowerCase()] || '#64748b';
                            const isDeleting = deletingId === exp.id;

                            if (isDeleting) {
                                return (
                                    <tr key={exp.id} style={{ borderLeft: `4px solid #ef4444`, background: '#fff5f5' }}>
                                        <td colSpan={4} style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.875rem', padding: '0.75rem 1rem' }}>
                                            Delete &ldquo;{exp.description || exp.category}&rdquo; (₹{parseFloat(exp.amount).toLocaleString('en-IN')})? This cannot be undone.
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                <button
                                                    className="btn-icon"
                                                    title="Confirm Delete"
                                                    onClick={() => onDelete(exp.id)}
                                                    style={{ color: '#dc2626', fontWeight: 700 }}
                                                >
                                                    <HiOutlineCheck />
                                                </button>
                                                <button
                                                    className="btn-icon"
                                                    title="Cancel"
                                                    onClick={onCancelDelete}
                                                    style={{ color: '#64748b' }}
                                                >
                                                    <HiOutlineXMark />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }

                            return (
                                <tr key={exp.id} style={{ borderLeft: `4px solid ${catColor}` }}>
                                    <td>{formatDate(exp.date)}</td>
                                    <td>
                                        <span className={`category-badge ${exp.category.toLowerCase()}`}>
                                            {exp.category}
                                        </span>
                                    </td>
                                    <td style={{ color: exp.description ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                                        {exp.description || '—'}
                                    </td>
                                    <td className="expense-amount" style={{ color: '#e11d48', fontWeight: 600 }}>
                                        ₹{parseFloat(exp.amount).toLocaleString('en-IN')}
                                    </td>
                                    <td>
                                        <div className="expense-actions">
                                            <button
                                                className="btn-icon"
                                                title="Edit"
                                                onClick={() => onEdit(exp)}
                                            >
                                                <HiOutlinePencilSquare />
                                            </button>
                                            <button
                                                className="btn-icon"
                                                title="Delete"
                                                onClick={() => onDelete(exp.id)}
                                                style={{ color: '#ef4444' }}
                                            >
                                                <HiOutlineTrash />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </>
    );
};

export default ExpenseList;
