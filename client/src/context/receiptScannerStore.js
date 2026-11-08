import { createContext, useContext } from 'react';

export const ReceiptScannerContext = createContext(null);

export const useReceiptScanner = () => {
    const context = useContext(ReceiptScannerContext);
    if (!context) {
        throw new Error('useReceiptScanner must be used within ReceiptScannerProvider');
    }
    return context;
};
