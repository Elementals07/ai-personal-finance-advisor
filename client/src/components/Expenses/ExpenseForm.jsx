import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { HiOutlinePlusCircle, HiOutlineCamera } from 'react-icons/hi2';
import { useCategories } from '../../hooks/useCategories';
import API from '../../api/axios';

const ExpenseForm = ({ onSubmit, onClose, editData = null }) => {
    const { categoryNames } = useCategories();
    const [amount, setAmount] = useState(editData?.amount || '');
    const [category, setCategory] = useState(editData?.category || 'Food');
    const [date, setDate] = useState(editData?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
    const [description, setDescription] = useState(editData?.description || '');
    const [loading, setLoading] = useState(false);
    const [scanning, setScanning] = useState(false);
    const fileInputRef = useRef(null);

    const handleScanReceipt = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setScanning(true);
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const res = await API.post('/ai/scan-bill', {
                    image: reader.result,
                    mimeType: file.type
                });
                const data = res.data.data;
                if (data.totalAmount) setAmount(String(data.totalAmount));
                if (data.primaryCategory && categoryNames.includes(data.primaryCategory)) {
                    setCategory(data.primaryCategory);
                }
                if (data.billDate) {
                    setDate(data.billDate);
                    toast.success(`Scanned bill! Date set to ${data.billDate}`);
                } else {
                    toast.success('Scanned bill! Date defaulted to today (editable)');
                }
                if (data.merchant) {
                    setDescription(data.merchant);
                }
            } catch (err) {
                toast.error('Could not auto-read receipt. Please fill details manually.');
            } finally {
                setScanning(false);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!amount || parseFloat(amount) <= 0) {
            toast.error('Enter a valid amount');
            return;
        }
        if (!date) {
            toast.error('Select a date');
            return;
        }
        setLoading(true);
        try {
            await onSubmit({
                amount: parseFloat(amount),
                category,
                date,
                description: description.trim() || null
            });
            toast.success(editData ? 'Expense updated!' : 'Expense added!');
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save expense');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2>{editData ? '✏️ Edit Expense' : '➕ Add Expense'}</h2>

                {!editData && (
                    <>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={scanning}
                            style={{
                                width: '100%',
                                padding: '0.65rem',
                                marginBottom: '1rem',
                                borderRadius: '8px',
                                border: '1px dashed #818cf8',
                                background: '#f5f3ff',
                                color: '#4338ca',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <HiOutlineCamera style={{ fontSize: '1.1rem' }} />
                            <span>{scanning ? 'Analyzing bill with Gemini...' : '📸 Auto-fill from Bill / Receipt Image'}</span>
                        </button>
                        <input 
                            ref={fileInputRef} 
                            type="file" 
                            accept="image/*" 
                            capture="environment" 
                            style={{ display: 'none' }} 
                            onChange={handleScanReceipt} 
                        />
                    </>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="expense-amount">Amount (₹)</label>
                            <input
                                id="expense-amount"
                                type="number"
                                step="0.01"
                                min="0.01"
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="expense-category">Category</label>
                            <select
                                id="expense-category"
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                            >
                                {categoryNames.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="expense-date">Date</label>
                        <input
                            id="expense-date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="expense-desc">Description (optional)</label>
                        <input
                            id="expense-desc"
                            type="text"
                            placeholder="e.g., Lunch at office canteen"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={255}
                        />
                    </div>
                    <div className="form-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? <span className="spinner" /> : (
                                <><HiOutlinePlusCircle /> {editData ? 'Update' : 'Add Expense'}</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ExpenseForm;
