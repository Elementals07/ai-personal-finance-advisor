import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { ReceiptScannerContext } from './receiptScannerStore';

const MAX_CONCURRENT_SCANS = 2;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const SCAN_TIMEOUT_MS = 120000;

const getLocalDate = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
};

const makeJobId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read this image.'));
    reader.readAsDataURL(file);
});

const fingerprintFile = async (file) => {
    try {
        if (!crypto?.subtle) throw new Error('Subtle crypto is unavailable.');
        const buffer = await file.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', buffer);
        const hex = Array.from(new Uint8Array(digest))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
        return `receipt_${hex}`;
    } catch {
        // Queue-level fallback only (e.g. an insecure context). The backend
        // still normalises and validates every parsed receipt.
        const safeName = String(file.name || 'receipt').replace(/[^A-Za-z0-9_.-]/g, '_');
        return `receipt_local_${safeName}_${file.size}_${file.lastModified}`.slice(0, 72);
    }
};

const toDraft = (data) => {
    const items = Array.isArray(data?.items)
        ? data.items.map(item => ({
            name: typeof item?.name === 'string' ? item.name : '',
            amount: item?.amount !== undefined && item?.amount !== null ? String(item.amount) : '',
            category: typeof item?.category === 'string' ? item.category : ''
        }))
        : [];

    return {
        merchant: typeof data?.merchant === 'string' ? data.merchant : '',
        totalAmount: data?.totalAmount !== undefined && data?.totalAmount !== null
            ? String(data.totalAmount)
            : '',
        category: typeof data?.primaryCategory === 'string' ? data.primaryCategory : '',
        billDate: data?.billDate || getLocalDate(),
        items,
        splitItems: items.length > 1
    };
};

export const ReceiptScannerProvider = ({ children }) => {
    const [jobs, setJobs] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const jobsRef = useRef(jobs);
    const controllersRef = useRef(new Map());
    const startedRef = useRef(new Set());

    useEffect(() => {
        jobsRef.current = jobs;
    }, [jobs]);

    // Abort any in-flight requests if the whole protected layout unmounts.
    useEffect(() => () => {
        controllersRef.current.forEach(controller => controller.abort());
        controllersRef.current.clear();
    }, []);

    // Controlled concurrency: keep at most two receipt requests in flight.
    useEffect(() => {
        const scanningCount = jobs.filter(job => job.status === 'scanning').length;
        if (scanningCount >= MAX_CONCURRENT_SCANS) return;

        const nextJobs = jobs
            .filter(job => job.status === 'waiting' && !startedRef.current.has(job.id))
            .slice(0, MAX_CONCURRENT_SCANS - scanningCount);
        if (nextJobs.length === 0) return;

        nextJobs.forEach(job => startedRef.current.add(job.id));
        setJobs(previous => previous.map(job => (
            nextJobs.some(next => next.id === job.id)
                ? { ...job, status: 'scanning', error: null }
                : job
        )));

        nextJobs.forEach(job => {
            const controller = new AbortController();
            controllersRef.current.set(job.id, controller);

            API.post('/ai/scan-bill', {
                image: job.preview,
                mimeType: job.mimeType,
                refresh: Boolean(job.refresh)
            }, {
                signal: controller.signal,
                timeout: SCAN_TIMEOUT_MS
            })
                .then(response => {
                    const data = response.data?.data;
                    if (!data || typeof data !== 'object') {
                        throw new Error('The AI returned an unreadable receipt result.');
                    }
                    setJobs(previous => previous.map(entry => (
                        entry.id === job.id
                            ? {
                                ...entry,
                                status: 'completed',
                                result: data,
                                draft: toDraft(data),
                                error: null,
                                completedAt: Date.now()
                            }
                            : entry
                    )));
                    toast.success(`${job.fileName}: details ready for review.`);
                })
                .catch(error => {
                    if (controller.signal.aborted || error.code === 'ERR_CANCELED') return;
                    const message = error.response?.data?.message
                        || error.message
                        || 'Could not read this receipt.';
                    setJobs(previous => previous.map(entry => (
                        entry.id === job.id
                            ? { ...entry, status: 'failed', error: message, result: null, draft: null }
                            : entry
                    )));
                    toast.error(`${job.fileName}: ${message}`);
                })
                .finally(() => {
                    controllersRef.current.delete(job.id);
                });
        });
    }, [jobs]);

    const openScanner = useCallback(() => setIsOpen(true), []);
    const closeScanner = useCallback(() => setIsOpen(false), []);

    const addFiles = useCallback(async (fileList) => {
        const files = Array.from(fileList || []);
        if (files.length === 0) return;

        const knownFingerprints = new Set(
            jobsRef.current.map(job => job.fingerprint).filter(Boolean)
        );
        const additions = [];

        for (const file of files) {
            if (!file.type?.startsWith('image/')) {
                toast.error(`${file.name}: choose a PNG, JPG or WebP image.`);
                continue;
            }
            if (file.size > MAX_FILE_BYTES) {
                toast.error(`${file.name}: image must be under 8 MB.`);
                continue;
            }

            const fingerprint = await fingerprintFile(file);
            if (knownFingerprints.has(fingerprint)) {
                toast.error(`${file.name} is already in the scan queue.`);
                continue;
            }

            let preview;
            try {
                preview = await readFileAsDataUrl(file);
            } catch (error) {
                toast.error(`${file.name}: ${error.message}`);
                continue;
            }

            knownFingerprints.add(fingerprint);
            additions.push({
                id: makeJobId(),
                fileName: file.name || 'Receipt',
                preview,
                mimeType: file.type || 'image/jpeg',
                fingerprint,
                status: 'waiting',
                result: null,
                draft: null,
                error: null,
                refresh: false,
                addedAt: Date.now()
            });
        }

        if (additions.length === 0) return;

        setJobs(previous => [...previous, ...additions]);
        setIsOpen(true);
        toast.success(
            `${additions.length} receipt${additions.length === 1 ? '' : 's'} added. Scanning continues in the background.`
        );
    }, []);

    const updateJobDraft = useCallback((id, patch) => {
        setJobs(previous => previous.map(job => (
            job.id === id
                ? { ...job, draft: { ...(job.draft || {}), ...patch } }
                : job
        )));
    }, []);

    const retryJob = useCallback((id) => {
        startedRef.current.delete(id);
        setJobs(previous => previous.map(job => (
            job.id === id
                ? {
                    ...job,
                    status: 'waiting',
                    result: null,
                    draft: null,
                    error: null,
                    refresh: false
                }
                : job
        )));
    }, []);

    const rescanJob = useCallback((id) => {
        startedRef.current.delete(id);
        setJobs(previous => previous.map(job => (
            job.id === id
                ? {
                    ...job,
                    status: 'waiting',
                    result: null,
                    draft: null,
                    error: null,
                    refresh: true
                }
                : job
        )));
    }, []);

    const removeJob = useCallback((id) => {
        const controller = controllersRef.current.get(id);
        if (controller) controller.abort();
        controllersRef.current.delete(id);
        startedRef.current.delete(id);
        setJobs(previous => previous.filter(job => job.id !== id));
    }, []);

    const clearFinished = useCallback(() => {
        setJobs(previous => previous.filter(job => (
            job.status !== 'completed' && job.status !== 'failed'
        )));
    }, []);

    const saveJob = useCallback(async (id) => {
        const job = jobsRef.current.find(entry => entry.id === id);
        if (!job || job.status !== 'completed' || !job.draft) {
            toast.error('This receipt is not ready to save.');
            return false;
        }

        const {
            merchant = '',
            totalAmount = '',
            category = '',
            billDate = '',
            items = [],
            splitItems = false
        } = job.draft;
        const merchantName = String(merchant).trim();

        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(billDate))) {
            toast.error('Choose a valid bill date.');
            return false;
        }
        if (!category) {
            toast.error('Choose a category.');
            return false;
        }

        if (splitItems) {
            if (!Array.isArray(items) || items.length === 0) {
                toast.error('Add at least one line item or turn off itemized entry.');
                return false;
            }
            for (const item of items) {
                const amount = parseFloat(item.amount);
                if (!Number.isFinite(amount) || amount <= 0) {
                    toast.error('Every line item needs a valid amount.');
                    return false;
                }
                if (!item.category) {
                    toast.error('Every line item needs a category.');
                    return false;
                }
            }
        } else {
            const amount = parseFloat(totalAmount);
            if (!Number.isFinite(amount) || amount <= 0) {
                toast.error('Enter a valid bill amount.');
                return false;
            }
        }

        try {
            if (splitItems) {
                const payload = items.map((item, index) => ({
                    amount: parseFloat(item.amount),
                    category: item.category || category,
                    description: (merchantName ? `${merchantName}: ${item.name}` : item.name).trim()
                        || 'Scanned item',
                    date: billDate,
                    fingerprint: `${job.fingerprint}_${index}`
                }));
                const response = await API.post('/expenses/batch', { items: payload });
                const created = response.data?.data?.created?.length || 0;
                const skipped = response.data?.data?.skipped?.length || 0;

                if (created === 0 && skipped > 0) {
                    toast('This receipt was already recorded.', { icon: 'ℹ️' });
                } else {
                    toast.success(`${created || payload.length} itemized expense${(created || payload.length) === 1 ? '' : 's'} recorded.`);
                }
            } else {
                await API.post('/expenses', {
                    amount: parseFloat(totalAmount),
                    category,
                    date: billDate,
                    description: merchantName ? `Bill: ${merchantName}` : 'Scanned receipt',
                    fingerprint: job.fingerprint
                });
                toast.success('Receipt expense recorded.');
            }

            setJobs(previous => previous.filter(entry => entry.id !== id));
            window.dispatchEvent(new CustomEvent('expenses:changed'));
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save the scanned receipt.');
            return false;
        }
    }, []);

    const stats = useMemo(() => {
        const counts = { waiting: 0, scanning: 0, completed: 0, failed: 0 };
        jobs.forEach(job => {
            if (counts[job.status] !== undefined) counts[job.status] += 1;
        });
        return {
            ...counts,
            active: counts.waiting + counts.scanning,
            total: jobs.length
        };
    }, [jobs]);

    const value = useMemo(() => ({
        jobs,
        stats,
        isOpen,
        openScanner,
        closeScanner,
        addFiles,
        updateJobDraft,
        retryJob,
        rescanJob,
        removeJob,
        clearFinished,
        saveJob
    }), [
        jobs,
        stats,
        isOpen,
        openScanner,
        closeScanner,
        addFiles,
        updateJobDraft,
        retryJob,
        rescanJob,
        removeJob,
        clearFinished,
        saveJob
    ]);

    return (
        <ReceiptScannerContext.Provider value={value}>
            {children}
        </ReceiptScannerContext.Provider>
    );
};
