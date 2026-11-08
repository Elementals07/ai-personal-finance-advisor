import { HiOutlineCamera, HiOutlineChevronRight } from 'react-icons/hi2';
import { useReceiptScanner } from '../../context/receiptScannerStore';

const ReceiptScannerDock = () => {
    const { stats, isOpen, openScanner } = useReceiptScanner();

    if (isOpen || stats.total === 0) return null;

    let title = 'Receipt scanner';
    if (stats.active > 0) {
        title = `Scanning ${stats.active} receipt${stats.active === 1 ? '' : 's'}…`;
    } else if (stats.completed > 0) {
        title = `${stats.completed} receipt${stats.completed === 1 ? '' : 's'} ready to review`;
    } else if (stats.failed > 0) {
        title = `${stats.failed} receipt${stats.failed === 1 ? '' : 's'} need attention`;
    }

    const detail = stats.active > 0
        ? 'Runs in the background — keep browsing.'
        : stats.completed > 0
            ? 'Open the queue to confirm and save.'
            : 'Open the queue to retry or remove.';

    return (
        <div className="scanner-dock" role="status" aria-live="polite">
            <button type="button" className="scanner-dock-button" onClick={openScanner}>
                <span className={`scanner-dock-icon ${stats.active > 0 ? 'is-active' : ''}`}>
                    {stats.active > 0
                        ? <span className="spinner" aria-hidden="true" />
                        : <HiOutlineCamera aria-hidden="true" />}
                </span>
                <span className="scanner-dock-copy">
                    <strong>{title}</strong>
                    <span>{detail}</span>
                </span>
                <HiOutlineChevronRight className="scanner-dock-chevron" aria-hidden="true" />
            </button>
        </div>
    );
};

export default ReceiptScannerDock;
