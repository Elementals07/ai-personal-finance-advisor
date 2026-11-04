import { useMemo, useRef, useState } from 'react';
import {
    HiOutlineArrowPath,
    HiOutlineChatBubbleLeftRight,
    HiOutlineCheck,
    HiOutlineSparkles,
    HiOutlineTrash,
    HiOutlineXMark
} from 'react-icons/hi2';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { useCategories } from '../../hooks/useCategories';

const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const isValidItem = (item) => {
    const amount = Number(item.amount);
    return Number.isFinite(amount) && amount > 0 && isValidDate(item.date) && Boolean(item.category);
};

const toEditableItems = (list) => (Array.isArray(list) ? list : []).map(item => ({
    ...item,
    amount: item.amount !== undefined && item.amount !== null ? String(item.amount) : '',
    _selected: !item.needsReview && Number(item.amount) > 0
}));

const buildMessagesFromText = (raw) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return [];

    const blocks = trimmed.split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);
    const units = blocks.length > 1
        ? blocks
        : trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return units.map((body, index) => ({
        id: `paste-${index + 1}`,
        body,
        date: today,
        address: 'Pasted SMS'
    }));
};

const SmsImportModal = ({ onClose, onSuccess }) => {
    const { categoryNames } = useCategories();
    const inFlightRef = useRef(false);

    const [text, setText] = useState('');
    const [sourceMessages, setSourceMessages] = useState([]);
    const [items, setItems] = useState([]);
    const [step, setStep] = useState(1);
    const [parsing, setParsing] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);

    const selectedItems = useMemo(
        () => items.filter(item => item._selected && isValidItem(item)),
        [items]
    );

    const toggleItem = (index) => {
        setItems(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], _selected: !updated[index]._selected };
            return updated;
        });
    };

    const updateItem = (index, field, value) => {
        setItems(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    const removeItem = (index) => {
        setItems(prev => prev.filter((_, itemIndex) => itemIndex !== index));
    };

    const handleParse = async () => {
        if (inFlightRef.current) return;

        const messages = buildMessagesFromText(text);
        if (messages.length === 0) {
            toast.error('Paste at least one bank or UPI SMS message');
            return;
        }

        inFlightRef.current = true;
        setParsing(true);
        try {
            const res = await API.post('/ai/parse-sms', { messages });
            const transactions = res.data?.data?.transactions;
            if (!Array.isArray(transactions)) {
                throw new Error('The AI returned an invalid SMS result.');
            }

            setSourceMessages(messages);
            setItems(toEditableItems(transactions));
            setStep(2);
            toast.success(
                transactions.length > 0
                    ? `${transactions.length} debit transaction${transactions.length === 1 ? '' : 's'} detected.`
                    : 'No debit transactions were found in these messages.'
            );
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not parse these SMS messages.');
        } finally {
            inFlightRef.current = false;
            setParsing(false);
        }
    };

    const handleRefresh = async () => {
        if (inFlightRef.current || sourceMessages.length === 0) return;

        inFlightRef.current = true;
        setRefreshing(true);
        try {
            const res = await API.post('/ai/parse-sms', {
                messages: sourceMessages,
                refresh: true
            });
            const transactions = res.data?.data?.transactions;
            if (!Array.isArray(transactions)) {
                throw new Error('The AI returned an invalid SMS result.');
            }

            setItems(toEditableItems(transactions));
            toast.success(
                transactions.length > 0
                    ? 'SMS results refreshed from AI.'
                    : 'No debit transactions were found in these messages.'
            );
        } catch (err) {
            toast.error(
                err.response?.data?.message
                    ? `${err.response.data.message} Previous results were kept.`
                    : 'Could not refresh SMS results. Previous results were kept.'
            );
        } finally {
            inFlightRef.current = false;
            setRefreshing(false);
        }
    };

    const handleSave = async () => {
        if (selectedItems.length === 0) {
            toast.error('Select at least one valid transaction to import');
            return;
        }

        setSaving(true);
        try {
            const payload = selectedItems.map(item => ({
                smsId: item.smsId,
                fingerprint: item.fingerprint,
                amount: parseFloat(item.amount),
                category: item.category,
                date: item.date,
                merchant: item.merchant,
                description: `${item.merchant || 'Bank SMS'} (via SMS)`
            }));

            const res = await API.post('/expenses/sms-import', { items: payload });
            const created = res.data?.data?.created?.length || 0;
            const skipped = res.data?.data?.skipped?.length || 0;

            if (created > 0) {
                toast.success(
                    `${created} transaction${created === 1 ? '' : 's'} imported${skipped > 0 ? `, ${skipped} already recorded` : ''}`
                );
            } else {
                toast('Those transactions were already imported.', { icon: 'ℹ️' });
            }

            if (onSuccess) await onSuccess();

            const importedIds = new Set(selectedItems.map(item => item.smsId));
            const remaining = items.filter(item => !importedIds.has(item.smsId));
            setItems(remaining);

            if (remaining.length === 0) onClose();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to import bank transactions');
        } finally {
            setSaving(false);
        }
    };

    const busy = parsing || refreshing || saving;

    return (
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="sms-modal-title">
            <div className="modal" style={{ maxWidth: '720px' }} onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h2 id="sms-modal-title" className="modal-title">Import Bank SMS</h2>
                        <p className="modal-subtitle">
                            {step === 1
                                ? 'Paste bank or UPI messages to detect debit transactions'
                                : `Review ${items.length} detected ${items.length === 1 ? 'debit' : 'debits'}`}
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {step === 2 && (
                            <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={handleRefresh}
                                disabled={busy}
                                title="Re-run AI on these messages and bypass the saved result"
                            >
                                <HiOutlineArrowPath
                                    className={refreshing ? 'spinner' : ''}
                                    aria-hidden="true"
                                />
                                {refreshing ? 'Refreshing...' : 'Refresh AI'}
                            </button>
                        )}
                        <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close dialog">
                            <HiOutlineXMark aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div className="modal-body">
                    {step === 1 && (
                        <div>
                            <div className="form-group">
                                <label htmlFor="sms-input" className="form-label">
                                    Bank / UPI SMS messages
                                </label>
                                <textarea
                                    id="sms-input"
                                    className="form-input"
                                    value={text}
                                    onChange={(event) => setText(event.target.value)}
                                    rows={10}
                                    placeholder={'Paste one message per line, or separate messages with a blank line.\n\nExample: Rs.450.00 debited from A/c XX1234 to SWIGGY on 04-11-26.'}
                                    disabled={parsing}
                                />
                                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                                    Only completed debit transactions are imported. OTPs, credits, balances and failed payments are ignored.
                                </p>
                            </div>

                            <div className="status-banner good">
                                <HiOutlineChatBubbleLeftRight className="status-banner-icon" aria-hidden="true" />
                                <div className="status-banner-text">
                                    Messages are sent to the backend for parsing. Raw SMS text is not stored in the cache.
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div>
                            {items.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                                    <div className="empty-state-icon" style={{ margin: '0 auto 1rem' }}>
                                        <HiOutlineSparkles aria-hidden="true" />
                                    </div>
                                    <h3 style={{ marginBottom: '0.25rem' }}>No debit transactions found</h3>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                        Try refreshing the AI result or paste different messages.
                                    </p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {items.map((item, index) => (
                                        <div
                                            key={item.smsId || index}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                borderRadius: 'var(--radius-sm)',
                                                padding: '0.75rem',
                                                background: item._selected ? 'var(--bg-surface-subtle)' : 'transparent'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(item._selected)}
                                                    onChange={() => toggleItem(index)}
                                                    aria-label={`Select ${item.merchant || 'transaction'}`}
                                                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary)' }}
                                                />
                                                <strong style={{ flex: 1 }}>{item.merchant || 'Unknown Merchant'}</strong>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                    {item.source || 'Bank'}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline btn-sm"
                                                    onClick={() => removeItem(index)}
                                                    aria-label="Remove transaction"
                                                    style={{ minWidth: '32px', height: '32px', padding: 0 }}
                                                >
                                                    <HiOutlineTrash aria-hidden="true" />
                                                </button>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.5rem' }}>
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    value={item.merchant || ''}
                                                    onChange={(event) => updateItem(index, 'merchant', event.target.value)}
                                                    placeholder="Merchant"
                                                    aria-label="Merchant"
                                                    style={{ height: '36px', fontSize: '0.8125rem' }}
                                                />
                                                <input
                                                    type="number"
                                                    step="any"
                                                    min="0.01"
                                                    className="form-input num"
                                                    value={item.amount}
                                                    onChange={(event) => updateItem(index, 'amount', event.target.value)}
                                                    placeholder="Amount"
                                                    aria-label="Amount"
                                                    style={{ height: '36px', fontSize: '0.8125rem' }}
                                                />
                                                <input
                                                    type="date"
                                                    className="form-input"
                                                    value={item.date || ''}
                                                    onChange={(event) => updateItem(index, 'date', event.target.value)}
                                                    aria-label="Date"
                                                    style={{ height: '36px', fontSize: '0.8125rem' }}
                                                />
                                                <select
                                                    className="form-select"
                                                    value={item.category || categoryNames[0] || 'Others'}
                                                    onChange={(event) => updateItem(index, 'category', event.target.value)}
                                                    aria-label="Category"
                                                    style={{ height: '36px', fontSize: '0.8125rem' }}
                                                >
                                                    {categoryNames.map(name => (
                                                        <option key={name} value={name}>{name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {item.needsReview && (
                                                <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--color-warning, #b45309)' }}>
                                                    This transaction needs review before importing.
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    {step === 1 ? (
                        <button type="button" className="btn btn-primary" onClick={handleParse} disabled={parsing}>
                            {parsing ? 'Parsing...' : 'Parse with AI'}
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSave}
                            disabled={saving || selectedItems.length === 0}
                        >
                            <HiOutlineCheck aria-hidden="true" />
                            {saving
                                ? 'Importing...'
                                : `Import ${selectedItems.length} Transaction${selectedItems.length === 1 ? '' : 's'}`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SmsImportModal;
