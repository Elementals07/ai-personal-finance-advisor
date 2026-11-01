import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { HiOutlineBars3, HiOutlineXMark, HiOutlineSparkles } from 'react-icons/hi2';
import { useAuth } from '../../context/AuthContext';

const Layout = () => {
    const { user } = useAuth();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        try { return localStorage.getItem('sidebar-collapsed') === 'true'; }
        catch { return false; }
    });
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const handler = (e) => setSidebarCollapsed(e.detail.collapsed);
        window.addEventListener('sidebarToggle', handler);
        return () => window.removeEventListener('sidebarToggle', handler);
    }, []);

    const getInitials = (name) => {
        if (!name) return '?';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    return (
        <div className="app-layout">
            {/* Mobile Header Bar (visible on < 768px) */}
            <header className="mobile-header">
                <button 
                    type="button" 
                    className="mobile-menu-btn" 
                    onClick={() => setMobileOpen(o => !o)}
                    aria-label="Toggle Navigation Menu"
                >
                    {mobileOpen ? <HiOutlineXMark /> : <HiOutlineBars3 />}
                </button>

                <div className="mobile-brand">
                    <div className="mobile-brand-icon">
                        <HiOutlineSparkles style={{ fontSize: '1.1rem', color: '#fff' }} />
                    </div>
                    <span className="mobile-brand-text">FinanceAI</span>
                </div>

                <div className="mobile-avatar" title={user?.name || 'User'}>
                    {getInitials(user?.name)}
                </div>
            </header>

            {/* Mobile Backdrop Overlay */}
            {mobileOpen && (
                <div 
                    className="mobile-overlay" 
                    onClick={() => setMobileOpen(false)}
                    aria-hidden="true" 
                />
            )}

            {/* Sidebar */}
            <Sidebar 
                mobileOpen={mobileOpen} 
                onCloseMobile={() => setMobileOpen(false)} 
            />

            {/* Main Content Area */}
            <main className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
                <div className="page-wrapper">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Layout;
