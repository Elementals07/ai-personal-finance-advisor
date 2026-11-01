import { useState, useEffect, useCallback } from 'react';
import API from '../api/axios';
import ExpenseForm from '../components/Expenses/ExpenseForm';
import ExpenseList from '../components/Expenses/ExpenseList';
import BillScannerModal from '../components/Expenses/BillScannerModal';
import toast from 'react-hot-toast';
import { HiOutlinePlusCircle } from 'react-icons/hi2';
import { useCategories } from '../hooks/useCategories';

const TIME_FILTERS = ['Today', 'This Week', 'This Month', 'Specific Date', 'All Time'];

const ExpensesPage = () => {
    const { categoryNames } = useCategories();
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [editExpense, setEditExpense] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [filterMonth, setFilterMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [filterCategory, setFilterCategory] = useState('All');
    const [timeFilter, setTimeFilter] = useState('This Month');
    const [specificDate, setSpecificDate] = useState(() => new Date().toISOString().slice(0, 10));

    const fetchExpenses = useCallback(async (pageNum = 1, isLoadMore = false) => {
        if (!isLoadMore) setLoading(true);
        else setLoadingMore(true);

        try {
            let url = `/expenses?page=${pageNum}&limit=25&`;
            const params = [];

            // Apply time filter
            const now = new Date();
            const getLocalDateString = (date) => {
                const d = new Date(date);
                d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                return d.toISOString().slice(0, 10);
            };

            if (timeFilter === 'Today') {
                const today = getLocalDateString(now);
                params.push(`startDate=${today}`, `endDate=${today}`);
            } else if (timeFilter === 'This Week') {
                const dayOfWeek = now.getDay();
                const startOfWeek = new Date(now);
                startOfWeek.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                params.push(`startDate=${getLocalDateString(startOfWeek)}`, `endDate=${getLocalDateString(endOfWeek)}`);
            } else if (timeFilter === 'This Month') {
                params.push(`month=${filterMonth}`);
            } else if (timeFilter === 'Specific Date') {
                params.push(`startDate=${specificDate}`, `endDate=${specificDate}`);
            }

            if (filterCategory !== 'All') {
                params.push(`category=${filterCategory}`);
            }

            url += params.join('&');
            const res = await API.get(url);

            const newExpenses = res.data.data;
            if (isLoadMore) {
                setExpenses(prev => [...prev, ...newExpenses]);
            } else {
                setExpenses(newExpenses);
            }

            setHasMore(newExpenses.length === 25);
        } catch (err) {
            toast.error('Failed to load expenses');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [filterMonth, filterCategory, timeFilter, specificDate]);

    useEffect(() => {
        setPage(1);
        fetchExpenses(1, false);
    }, [filterMonth, filterCategory, timeFilter, specificDate]);

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchExpenses(nextPage, true);
    };

    const handleCreate = async (data) => {
        await API.post('/expenses', data);
        fetchExpenses();
    };

    const handleUpdate = async (data) => {
        await API.put(`/expenses/${editExpense.id}`, data);
        setEditExpense(null);
        fetchExpenses();
    };

    const handleDelete = async (id) => {
        if (deletingId !== id) {
            setDeletingId(id);
            return;
        }
        try {
            await API.delete(`/expenses/${id}`);
            toast.success('Expense deleted');
            setDeletingId(null);
            fetchExpenses();
        } catch (err) {
            toast.error('Failed to delete expense');
        }
    };

    const handleEdit = (expense) => {
        setEditExpense(expense);
        setShowForm(true);
    };

    // Group expenses by date
    const groupedExpenses = expenses.reduce((groups, expense) => {
        const date = expense.date?.slice(0, 10);
        if (!groups[date]) groups[date] = [];
        groups[date].push(expense);
        return groups;
    }, {});

    // Sort dates descending
    const sortedDates = Object.keys(groupedExpenses).sort((a, b) => new Date(b) - new Date(a));

    // Calculate total for current view
    const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

    const formatDateHeader = (dateStr) => {
        const d = new Date(dateStr + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (d.getTime() === today.getTime()) return '📅 Today';
        if (d.getTime() === yesterday.getTime()) return '📅 Yesterday';
        return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <div>
            {/* Upgraded Page Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1>Expenses</h1>
                    <p style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{
                            background: '#f1f5f9', borderRadius: '20px', padding: '0.2rem 0.65rem',
                            fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.82rem'
                        }}>
                            {expenses.length} transaction{expenses.length !== 1 ? 's' : ''}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>·</span>
                        <span style={{
                            background: '#fef3c7', borderRadius: '20px', padding: '0.2rem 0.65rem',
                            fontWeight: 700, color: '#92400e', fontSize: '0.82rem'
                        }}>
                            Total ₹{total.toLocaleString('en-IN')}
                        </span>
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={() => setShowScanner(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: '#a5b4fc', color: '#4f46e5', background: 'linear-gradient(135deg, #f5f3ff, #eff6ff)', fontWeight: 600, border: '1px solid #c4b5fd' }}
                    >
                        <span>📸</span> Scan Bill
                    </button>
                    <button className="btn btn-primary" onClick={() => { setEditExpense(null); setShowForm(true); }}>
                        <HiOutlinePlusCircle /> Add Expense
                    </button>
                </div>
            </div>

            {/* Time Filter Tabs */}
            <div className="filter-tabs">
                {TIME_FILTERS.map(f => (
                    <button
                        key={f}
                        className={`filter-tab ${timeFilter === f ? 'active' : ''}`}
                        onClick={() => setTimeFilter(f)}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Additional Filters */}
            <div className="expense-controls">
                {timeFilter === 'This Month' && (
                    <input
                        type="month"
                        value={filterMonth}
                        onChange={(e) => setFilterMonth(e.target.value)}
                        id="filter-month"
                    />
                )}
                {timeFilter === 'Specific Date' && (
                    <input
                        type="date"
                        value={specificDate}
                        onChange={(e) => setSpecificDate(e.target.value)}
                        id="filter-date"
                    />
                )}
                <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    id="filter-category"
                >
                    <option value="All">All Categories</option>
                    {categoryNames.map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
            </div>

            {/* Grouped Expense List */}
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
                {loading ? (
                    <div className="card" style={{ padding: '1.5rem' }}>
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="loading-skeleton" style={{ height: '48px', marginBottom: '0.5rem' }} />
                        ))}
                    </div>
                ) : expenses.length === 0 ? (
                    <div className="card">
                        <div className="empty-state">
                            <div className="empty-state-icon">📝</div>
                            <h3>No expenses found</h3>
                            <p>Start tracking your spending by adding your first expense.</p>
                            <button className="btn btn-primary" onClick={() => { setEditExpense(null); setShowForm(true); }}>
                                <HiOutlinePlusCircle /> Add Your First Expense
                            </button>
                        </div>
                    </div>
                ) : (
                    sortedDates.map(date => {
                        const dayExpenses = groupedExpenses[date];
                        const dayTotal = dayExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);
                        return (
                            <div key={date} className="date-group">
                                <div className="date-group-header">
                                    <h4>{formatDateHeader(date)}</h4>
                                    <span className="date-total">₹{dayTotal.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="card">
                                    <ExpenseList
                                        expenses={dayExpenses}
                                        onEdit={handleEdit}
                                        onDelete={handleDelete}
                                        deletingId={deletingId}
                                        onCancelDelete={() => setDeletingId(null)}
                                        loading={false}
                                    />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Upgraded Load More */}
            {hasMore && !loading && (
                <div style={{ textAlign: 'center', margin: '2rem 0 1rem' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        style={{ padding: '0.7rem 2.5rem', fontSize: '0.875rem', borderRadius: '20px', minWidth: '200px' }}
                    >
                        {loadingMore ? (
                            <><span className="spinner" style={{ width: '16px', height: '16px' }} /> Loading...</>
                        ) : (
                            '↓ Load More Transactions'
                        )}
                    </button>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.6rem' }}>
                        Showing {expenses.length} results
                    </p>
                </div>
            )}

            {/* Expense Form Modal */}
            {showForm && (
                <ExpenseForm
                    editData={editExpense}
                    onSubmit={editExpense ? handleUpdate : handleCreate}
                    onClose={() => { setShowForm(false); setEditExpense(null); }}
                />
            )}

            {/* AI Bill Scanner Modal */}
            {showScanner && (
                <BillScannerModal
                    onClose={() => setShowScanner(false)}
                    onSuccess={() => fetchExpenses()}
                />
            )}
        </div>
    );
};

export default ExpensesPage;
