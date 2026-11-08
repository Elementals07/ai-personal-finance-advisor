import { useEffect, useMemo, useRef, useState } from 'react';
import {
    HiOutlineArrowPath,
    HiOutlineCamera,
    HiOutlineCheck,
    HiOutlineCloudArrowUp,
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlineXMark
} from 'react-icons/hi2';
import { useReceiptScanner } from '../../context/receiptScannerStore';
import { useCategories } from '../../hooks/useCategories';

const STATUS_LABELS = {
    waiting: 'Waiting',
    scanning: 'Scanning',
    completed: 'Ready to review',
    failed: 'Failed'
};

const CategorySelect = ({ value, onChange, categoryNames, ariaLabel }) => (
    <select
        className="form-select"
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
    >
        <option value="">Select category</option>
        {value && !categoryNames.includes(value) && (
            <option value={value}>{value}</option>
        )}
        {categoryNames.map(name => (
            <option key={name} value={name}>{name}</option>
        ))}
    </select>
);

const ReceiptScannerModal = () => {
    const {
        jobs,
        stats,
        isOpen,
        closeScanner,
        addFiles,
        updateJobDraft,
        retryJob,
        rescanJob,
        removeJob,
        clearFinished,
        saveJob
    } = useReceiptScanner();
    const { categoryNames } = useCategories();
    const fileInputRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [savingJobId, setSavingJobId] = useState(null);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            if (stats.active > 0 && !window.confirm('Scans are still running. They will continue in the background. Close the scanner?')) {
                return;
            }
            closeScanner();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, stats.active, closeScanner]);

    const sortedJobs = useMemo(
        () => [...jobs].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)),
        [jobs]
    );

    if (!isOpen) return null;

    const handleBackdropClick = () => {
        // A stray backdrop click must never discard a scan that is still
        // running. The explicit X / Escape flow remains available.
        if (stats.active > 0) return;
        closeScanner();
    };

    const handlePickedFiles = (files) => {
        if (files?.length) addFiles(files);
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setDragging(false);
        handlePickedFiles(event.dataTransfer?.files);
    };

    const handleSave = async (jobId) => {
        setSavingJobId(jobId);
        try {
            await saveJob(jobId);
        } finally {
            setSavingJobId(null);
        }
    };

    const updateItem = (job, index, patch) => {
        const items = (job.draft?.items || []).map((item, itemIndex) => (
            itemIndex === index ? { ...item, ...patch } : item
        ));
        updateJobDraft(job.id, { items });
    };

    const removeItem = (job, index) => {
        const items = (job.draft?.items || []).filter((_, itemIndex) => itemIndex !== index);
        updateJobDraft(job.id, {
            items,
            splitItems: items.length > 1 ? job.draft?.splitItems : false
        });
    };

    const addItem = (job) => {
        updateJobDraft(job.id, {
            splitItems: true,
            items: [
                ...(job.draft?.items || []),
                { name: '', amount: '', category: job.draft?.category || categoryNames[0] || '' }
            ]
        });
    };

    return (
        <div
            className="modal-overlay"
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-scanner-title"
        >
            <div
                className="modal scanner-modal"
                onClick={(event) => event.stopPropagation()}
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
                }}
                onDrop={handleDrop}
            >
                <div className="modal-header">
                    <div>
                        <h2 id="receipt-scanner-title" className="modal-title">Scan Receipts</h2>
                        <p className="modal-subtitle">
                            {stats.total === 0
                                ? 'Upload one or more bill photos. Scans continue in the background.'
                                : `${stats.total} receipt${stats.total === 1 ? '' : 's'} · ${stats.scanning} scanning · ${stats.waiting} waiting · ${stats.completed} ready`}
                        </p>
                    </div>
                    <div className="scanner-header-actions">
                        <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <HiOutlinePlus aria-hidden="true" />
                            Add receipts
                        </button>
                        {stats.completed + stats.failed > 0 && (
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={clearFinished}
                            >
                                Clear finished
                            </button>
                        )}
                        <button type="button" className="modal-close-btn" onClick={closeScanner} aria-label="Close scanner">
                            <HiOutlineXMark aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div className="modal-body">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        hidden
                        onChange={(event) => {
                            handlePickedFiles(event.target.files);
                            event.target.value = '';
                        }}
                    />

                    <div
                        className={`scanner-dropzone ${dragging ? 'is-dragging' : ''}`}
                        onClick={() => fileInputRef.current?.click()}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                fileInputRef.current?.click();
                            }
                        }}
                        role="button"
                        tabIndex={0}
                    >
                        <HiOutlineCloudArrowUp aria-hidden="true" className="scanner-dropzone-icon" />
                        <strong>Drop bill images here, or click to choose files</strong>
                        <span>PNG, JPG or WebP · up to 8 MB each · multiple receipts supported</span>
                    </div>

                    {sortedJobs.length === 0 ? (
                        <div className="scanner-empty">
                            <HiOutlineCamera aria-hidden="true" />
                            <p>No receipts in the queue yet.</p>
                        </div>
                    ) : (
                        <div className="scanner-job-list">
                            {sortedJobs.map(job => {
                                const draft = job.draft;
                                const isCompleted = job.status === 'completed';
                                const isBusy = job.status === 'waiting' || job.status === 'scanning';
                                const isSaving = savingJobId === job.id;

                                return (
                                    <article key={job.id} className={`scanner-job scanner-job-${job.status}`}>
                                        <div className="scanner-job-head">
                                            {job.preview ? (
                                                <img src={job.preview} alt="" className="scanner-thumb" />
                                            ) : (
                                                <div className="scanner-thumb scanner-thumb-placeholder">
                                                    <HiOutlineCamera aria-hidden="true" />
                                                </div>
                                            )}
                                            <div className="scanner-job-meta">
                                                <strong title={job.fileName}>{job.fileName}</strong>
                                                <span className={`scanner-status scanner-status-${job.status}`}>
                                                    {STATUS_LABELS[job.status] || job.status}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm scanner-remove-btn"
                                                onClick={() => removeJob(job.id)}
                                                aria-label={`Remove ${job.fileName}`}
                                            >
                                                <HiOutlineTrash aria-hidden="true" />
                                            </button>
                                        </div>

                                        {isBusy && (
                                            <div className="scanner-progress">
                                                <span className="spinner" aria-hidden="true" />
                                                <span>
                                                    {job.status === 'waiting'
                                                        ? 'Waiting for an available AI slot…'
                                                        : 'Reading the receipt with AI…'}
                                                </span>
                                            </div>
                                        )}

                                        {job.status === 'failed' && (
                                            <div className="scanner-failed">
                                                <p>{job.error || 'This receipt could not be read.'}</p>
                                                <div className="scanner-actions">
                                                    <button type="button" className="btn btn-outline btn-sm" onClick={() => retryJob(job.id)}>
                                                        <HiOutlineArrowPath aria-hidden="true" />
                                                        Retry
                                                    </button>
                                                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeJob(job.id)}>
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {isCompleted && draft && (
                                            <div className="scanner-review">
                                                {Array.isArray(job.result?.warnings) && job.result.warnings.length > 0 && (
                                                    <ul className="scanner-warnings">
                                                        {job.result.warnings.map((warning, index) => (
                                                            <li key={`${job.id}-warning-${index}`}>{warning}</li>
                                                        ))}
                                                    </ul>
                                                )}

                                                <div className="scanner-grid">
                                                    <label className="form-group">
                                                        <span className="form-label">Merchant</span>
                                                        <input
                                                            type="text"
                                                            className="form-input"
                                                            value={draft.merchant}
                                                            onChange={(event) => updateJobDraft(job.id, { merchant: event.target.value })}
                                                            placeholder="Merchant name"
                                                        />
                                                    </label>
                                                    <label className="form-group">
                                                        <span className="form-label">Total amount</span>
                                                        <input
                                                            type="number"
                                                            step="any"
                                                            min="0.01"
                                                            className="form-input num"
                                                            value={draft.totalAmount}
                                                            onChange={(event) => updateJobDraft(job.id, { totalAmount: event.target.value })}
                                                            placeholder="0.00"
                                                            disabled={draft.splitItems}
                                                        />
                                                    </label>
                                                    <label className="form-group">
                                                        <span className="form-label">Bill date</span>
                                                        <input
                                                            type="date"
                                                            className="form-input"
                                                            value={draft.billDate}
                                                            onChange={(event) => updateJobDraft(job.id, { billDate: event.target.value })}
                                                        />
                                                    </label>
                                                    <label className="form-group">
                                                        <span className="form-label">Category</span>
                                                        <CategorySelect
                                                            value={draft.category}
                                                            onChange={(value) => updateJobDraft(job.id, { category: value })}
                                                            categoryNames={categoryNames}
                                                            ariaLabel="Receipt category"
                                                        />
                                                    </label>
                                                </div>

                                                <label className="scanner-toggle">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(draft.splitItems)}
                                                        onChange={(event) => {
                                                            const split = event.target.checked;
                                                            updateJobDraft(job.id, {
                                                                splitItems: split,
                                                                items: split && draft.items.length === 0
                                                                    ? [{ name: '', amount: '', category: draft.category || categoryNames[0] || '' }]
                                                                    : draft.items
                                                            });
                                                        }}
                                                    />
                                                    <span>Split into individual line items</span>
                                                </label>

                                                {draft.splitItems && (
                                                    <div className="scanner-items">
                                                        {(draft.items || []).map((item, index) => (
                                                            <div className="scanner-item-row" key={`${job.id}-item-${index}`}>
                                                                <input
                                                                    type="text"
                                                                    className="form-input"
                                                                    value={item.name}
                                                                    onChange={(event) => updateItem(job, index, { name: event.target.value })}
                                                                    placeholder="Item"
                                                                    aria-label={`Item ${index + 1} name`}
                                                                />
                                                                <input
                                                                    type="number"
                                                                    step="any"
                                                                    min="0.01"
                                                                    className="form-input num"
                                                                    value={item.amount}
                                                                    onChange={(event) => updateItem(job, index, { amount: event.target.value })}
                                                                    placeholder="Amount"
                                                                    aria-label={`Item ${index + 1} amount`}
                                                                />
                                                                <CategorySelect
                                                                    value={item.category}
                                                                    onChange={(value) => updateItem(job, index, { category: value })}
                                                                    categoryNames={categoryNames}
                                                                    ariaLabel={`Item ${index + 1} category`}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-sm"
                                                                    onClick={() => removeItem(job, index)}
                                                                    aria-label={`Remove item ${index + 1}`}
                                                                >
                                                                    <HiOutlineTrash aria-hidden="true" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-sm"
                                                            onClick={() => addItem(job)}
                                                        >
                                                            <HiOutlinePlus aria-hidden="true" />
                                                            Add line item
                                                        </button>
                                                    </div>
                                                )}

                                                <div className="scanner-actions scanner-review-actions">
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline btn-sm"
                                                        onClick={() => rescanJob(job.id)}
                                                        disabled={isSaving}
                                                    >
                                                        <HiOutlineArrowPath aria-hidden="true" />
                                                        Re-scan with AI
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => removeJob(job.id)}
                                                        disabled={isSaving}
                                                    >
                                                        Discard
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-primary btn-sm"
                                                        onClick={() => handleSave(job.id)}
                                                        disabled={isSaving}
                                                    >
                                                        <HiOutlineCheck aria-hidden="true" />
                                                        {isSaving ? 'Saving…' : 'Save expense'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="modal-footer scanner-footer">
                    <p>
                        {stats.active > 0
                            ? 'You can close this window — scans keep running in the background.'
                            : 'Saved receipts appear instantly on Home and Expenses.'}
                    </p>
                    <button type="button" className="btn btn-primary" onClick={closeScanner}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReceiptScannerModal;
