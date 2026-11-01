import { useState, useRef } from 'react';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { useCategories } from '../../hooks/useCategories';
import { HiOutlineCamera, HiOutlineArrowPath, HiOutlineCheck, HiOutlineXMark } from 'react-icons/hi2';

const BillScannerModal = ({ onClose, onSuccess }) => {
    const { categoryNames } = useCategories();
    const fileInputRef = useRef(null);

    const [imagePreview, setImagePreview] = useState(null);
    const [mimeType, setMimeType] = useState('image/jpeg');
    const [base64Image, setBase64Image] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [saving, setSaving] = useState(false);

    // Scanned & editable fields
    const [scannedData, setScannedData] = useState(null);
    const [merchant, setMerchant] = useState('');
    const [totalAmount, setTotalAmount] = useState('');
    const [category, setCategory] = useState('Food');
    const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [dateDetected, setDateDetected] = useState(false);
    const [splitItems, setSplitItems] = useState(false);
    const [items, setItems] = useState([]);

    // Handle image file selection
    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file (JPG, PNG, WebP)');
            return;
        }

        if (file.size > 8 * 1024 * 1024) {
            toast.error('Image must be under 8MB');
            return;
        }

        setMimeType(file.type);
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            setImagePreview(result);
            setBase64Image(result);
            // Auto start scanning once image is selected
            processImageScan(result, file.type);
        };
        reader.readAsDataURL(file);
    };

    // Send to Gemini Multimodal OCR
    const processImageScan = async (base64, type) => {
        setScanning(true);
        setScannedData(null);
        try {
            const res = await API.post('/ai/scan-bill', {
                image: base64,
                mimeType: type || mimeType
            });

            const data = res.data.data;
            setScannedData(data);
            setMerchant(data.merchant || '');
            setTotalAmount(data.totalAmount ? String(data.totalAmount) : '');
            
            // Category matching
            if (data.primaryCategory && categoryNames.includes(data.primaryCategory)) {
                setCategory(data.primaryCategory);
            } else if (categoryNames.length > 0) {
                setCategory(categoryNames[0]);
            }

            // Date Resolution:
            // 1. If date detected from bill -> use it
            // 2. Otherwise default to current date (today)
            if (data.billDate) {
                setBillDate(data.billDate);
                setDateDetected(true);
            } else {
                setBillDate(new Date().toISOString().slice(0, 10));
                setDateDetected(false);
            }

            // Line items if available
            if (Array.isArray(data.items) && data.items.length > 1) {
                setItems(data.items.map(it => ({
                    name: it.name || '',
                    amount: it.amount ? String(it.amount) : '',
                    category: categoryNames.includes(it.category) ? it.category : 'Others'
                })));
            } else {
                setItems([]);
                setSplitItems(false);
            }

            toast.success('Bill scanned successfully!');
        } catch (err) {
            console.error('Scan error:', err);
            toast.error(err.response?.data?.message || 'Failed to scan bill. You can still enter details manually.');
            // Initialize with default date & empty values for manual entry
            setBillDate(new Date().toISOString().slice(0, 10));
            setDateDetected(false);
            setScannedData({ manualFallback: true });
        } finally {
            setScanning(false);
        }
    };

    // Update single item in split view
    const handleItemChange = (index, field, value) => {
        setItems(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    // Confirm and Save Expenses to DB
    const handleSave = async () => {
        if (!billDate) {
            toast.error('Please select a valid date');
            return;
        }

        setSaving(true);
        try {
            if (splitItems && items.length > 0) {
                // Save as multiple category transactions
                const validItems = items.filter(it => parseFloat(it.amount) > 0);
                if (validItems.length === 0) {
                    toast.error('At least one item must have a valid amount');
                    setSaving(false);
                    return;
                }

                await API.post('/expenses/batch', {
                    items: validItems.map(it => ({
                        amount: parseFloat(it.amount),
                        category: it.category,
                        description: `${merchant ? merchant + ': ' : ''}${it.name}`.trim(),
                        date: billDate
                    }))
                });

                toast.success(`Recorded ${validItems.length} expenses for ${billDate}!`);
            } else {
                // Save as single consolidated transaction
                const parsedAmount = parseFloat(totalAmount);
                if (isNaN(parsedAmount) || parsedAmount <= 0) {
                    toast.error('Please enter a valid amount');
                    setSaving(false);
                    return;
                }

                await API.post('/expenses', {
                    amount: parsedAmount,
                    category,
                    date: billDate,
                    description: merchant ? `Bill from ${merchant}` : 'Scanned receipt'
                });

                toast.success(`Expense of ₹${parsedAmount} recorded for ${billDate}!`);
            }

            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save expense');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div 
                className="modal" 
                onClick={(e) => e.stopPropagation()} 
                style={{ maxWidth: '580px', width: '92%', maxHeight: '90vh', overflowY: 'auto' }}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.8rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>📸</span> AI Bill & Receipt Scanner
                    </h2>
                    <button 
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >
                        <HiOutlineXMark />
                    </button>
                </div>

                {/* File Upload / Camera Zone */}
                {!imagePreview ? (
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            border: '2px dashed #94a3b8',
                            borderRadius: '12px',
                            padding: '2.5rem 1.5rem',
                            textAlign: 'center',
                            cursor: 'pointer',
                            background: '#f8fafc',
                            transition: 'all 0.2s ease',
                            marginBottom: '1rem'
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = '#94a3b8'}
                    >
                        <input 
                            ref={fileInputRef} 
                            type="file" 
                            accept="image/*" 
                            capture="environment"
                            style={{ display: 'none' }} 
                            onChange={handleFileSelect} 
                        />
                        <div style={{ fontSize: '2.8rem', color: '#6366f1', marginBottom: '0.5rem' }}>
                            <HiOutlineCamera style={{ margin: '0 auto' }} />
                        </div>
                        <h4 style={{ margin: '0 0 0.3rem', color: '#1e293b' }}>
                            Take a photo or upload bill
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                            Supports Kirana slips, restaurant bills, supermarket receipts, utility invoices (JPG, PNG)
                        </p>
                    </div>
                ) : (
                    /* Image Preview & Scan status */
                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: '#f8fafc', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                            <img 
                                src={imagePreview} 
                                alt="Receipt preview" 
                                style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1' }} 
                            />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                                    {merchant || 'Scanned Receipt'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    {scanning ? 'Gemini 2.5 Flash is extracting amounts & dates...' : 'Image loaded & analyzed'}
                                </div>
                            </div>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                    setImagePreview(null);
                                    setScannedData(null);
                                }}
                                style={{ fontSize: '0.78rem' }}
                                disabled={scanning}
                            >
                                Change
                            </button>
                        </div>
                    </div>
                )}

                {/* Scanning Spinner */}
                {scanning && (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                        <div className="spinner" style={{ margin: '0 auto 1rem' }} />
                        <h4 style={{ margin: '0 0 0.4rem', color: '#1e293b' }}>Reading bill with AI...</h4>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                            Detecting merchant, total amount, categories, and date.
                        </p>
                    </div>
                )}

                {/* Scanned & Editable Results Form */}
                {scannedData && !scanning && (
                    <div>
                        {/* Date Status Banner with Manual Override */}
                        <div style={{
                            background: dateDetected ? '#f0fdf4' : '#fffbeb',
                            border: `1px solid ${dateDetected ? '#bbf7d0' : '#fde68a'}`,
                            borderRadius: '8px',
                            padding: '0.65rem 0.9rem',
                            marginBottom: '1rem',
                            fontSize: '0.82rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            color: dateDetected ? '#166534' : '#92400e'
                        }}>
                            <span>{dateDetected ? '✅' : 'ℹ️'}</span>
                            <div style={{ flex: 1 }}>
                                <strong>
                                    {dateDetected ? 'Bill Date Detected:' : 'Date defaulted to Today:'}
                                </strong>{' '}
                                {dateDetected ? (
                                    <span>{billDate} (You can change this below if needed)</span>
                                ) : (
                                    <span>No date found on bill. Set to today's date or select a date below.</span>
                                )}
                            </div>
                        </div>

                        {/* Editable Form Inputs */}
                        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                            <div className="form-group">
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Store / Merchant Name
                                </label>
                                <input 
                                    type="text" 
                                    value={merchant} 
                                    onChange={e => setMerchant(e.target.value)}
                                    placeholder="e.g. D-Mart, Kirana Store"
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <div className="form-group">
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Bill Date (Editable)
                                </label>
                                <input 
                                    type="date" 
                                    value={billDate} 
                                    onChange={e => {
                                        setBillDate(e.target.value);
                                        setDateDetected(true);
                                    }}
                                    style={{ width: '100%', fontWeight: 600 }}
                                />
                            </div>
                        </div>

                        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1rem' }}>
                            <div className="form-group">
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Total Amount (₹)
                                </label>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    min="0.01" 
                                    value={totalAmount} 
                                    onChange={e => setTotalAmount(e.target.value)}
                                    placeholder="0.00"
                                    style={{ width: '100%', fontSize: '1.05rem', fontWeight: 700 }}
                                />
                            </div>

                            <div className="form-group">
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Primary Category
                                </label>
                                <select 
                                    value={category} 
                                    onChange={e => setCategory(e.target.value)}
                                    style={{ width: '100%' }}
                                >
                                    {categoryNames.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Multi-Item Breakdown Toggle */}
                        {items.length > 1 && (
                            <div style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                padding: '0.85rem',
                                marginBottom: '1.2rem'
                            }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={splitItems} 
                                        onChange={e => setSplitItems(e.target.checked)} 
                                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                    />
                                    <span>🔀 Split into {items.length} category items</span>
                                </label>

                                {splitItems && (
                                    <div style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        {items.map((it, idx) => (
                                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr', gap: '0.4rem', alignItems: 'center' }}>
                                                <input 
                                                    type="text" 
                                                    value={it.name} 
                                                    onChange={e => handleItemChange(idx, 'name', e.target.value)}
                                                    placeholder="Item name"
                                                    style={{ fontSize: '0.8rem', padding: '0.4rem' }}
                                                />
                                                <input 
                                                    type="number" 
                                                    step="0.01" 
                                                    value={it.amount} 
                                                    onChange={e => handleItemChange(idx, 'amount', e.target.value)}
                                                    placeholder="₹"
                                                    style={{ fontSize: '0.8rem', padding: '0.4rem' }}
                                                />
                                                <select
                                                    value={it.category}
                                                    onChange={e => handleItemChange(idx, 'category', e.target.value)}
                                                    style={{ fontSize: '0.8rem', padding: '0.4rem' }}
                                                >
                                                    {categoryNames.map(c => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Confirmation Actions */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem' }}>
                            <button 
                                className="btn btn-secondary" 
                                onClick={onClose} 
                                disabled={saving}
                            >
                                Cancel
                            </button>
                            <button 
                                className="btn btn-primary" 
                                onClick={handleSave} 
                                disabled={saving || (!totalAmount && !splitItems)}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                {saving ? (
                                    <span>Saving...</span>
                                ) : (
                                    <>
                                        <HiOutlineCheck />
                                        <span>
                                            {splitItems 
                                                ? `Record ${items.length} Split Expenses` 
                                                : `Save ₹${totalAmount || '0'} to ${category}`}
                                        </span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BillScannerModal;
