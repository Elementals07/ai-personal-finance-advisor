import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
    HiOutlineChartPie, 
    HiOutlineCreditCard, 
    HiOutlineBanknotes,
    HiOutlineCpuChip,
    HiOutlineArrowRightOnRectangle,
    HiOutlineCircleStack,
    HiOutlineQueueList,
    HiOutlineQuestionMarkCircle,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineSparkles
} from 'react-icons/hi2';

const Sidebar = ({ mobileOpen, onCloseMobile }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem('sidebar-collapsed') === 'true'; } 
        catch { return false; }
    });

    useEffect(() => {
        try {
            localStorage.setItem('sidebar-collapsed', String(collapsed));
        } catch (e) {
            console.error(e);
        }
        window.dispatchEvent(new CustomEvent('sidebarToggle', { detail: { collapsed } }));
    }, [collapsed]);

    const handleLogout = () => { 
        logout(); 
        navigate('/login'); 
    };

    const getInitials = (name) => {
        if (!name) return '?';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const navSections = [
        { 
            section: 'Overview', 
            items: [
                { to: '/', end: true, icon: <HiOutlineChartPie />, label: 'Dashboard' },
                { to: '/savings', icon: <HiOutlineCircleStack />, label: 'Savings History' },
            ]
        },
        { 
            section: 'Manage', 
            items: [
                { to: '/expenses', icon: <HiOutlineCreditCard />, label: 'Expenses' },
                { to: '/budget', icon: <HiOutlineBanknotes />, label: 'Budget' },
                { to: '/sectors', icon: <HiOutlineQueueList />, label: 'Categories' },
            ]
        },
        { 
            section: 'Intelligence', 
            items: [
                { to: '/ai-insights', icon: <HiOutlineCpuChip />, label: 'AI Insights', badge: 'PRO' },
                { to: '/guide', icon: <HiOutlineQuestionMarkCircle />, label: 'System Guide' },
            ]
        },
    ];

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
            {/* Brand Header */}
            <div className="sidebar-header">
                <div className="sidebar-brand">
                    <div className="sidebar-brand-icon">
                        <HiOutlineSparkles style={{ fontSize: '1.35rem', color: '#ffffff' }} />
                    </div>
                    {!collapsed && (
                        <div className="sidebar-brand-text">
                            <h2>FinanceAI</h2>
                            <span>Autonomous Advisor</span>
                        </div>
                    )}
                </div>
                
                {/* Collapse / Expand Toggle for desktop */}
                <button 
                    type="button"
                    className="sidebar-collapse-btn"
                    onClick={() => setCollapsed(c => !c)}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    aria-label="Toggle Sidebar"
                >
                    {collapsed ? <HiOutlineChevronRight /> : <HiOutlineChevronLeft />}
                </button>
            </div>

            {/* Navigation */}
            <nav className="sidebar-nav">
                {navSections.map(({ section, items }) => (
                    <div key={section} style={{ marginBottom: '0.4rem' }}>
                        <div className="sidebar-section-title">{section}</div>
                        {items.map(({ to, end, icon, label, badge }) => (
                            <NavLink
                                key={to}
                                to={to}
                                end={end}
                                onClick={onCloseMobile}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                                title={collapsed ? label : undefined}
                            >
                                <span className="nav-icon">{icon}</span>
                                <span className="nav-item-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                    <span>{label}</span>
                                    {badge && !collapsed && (
                                        <span style={{ 
                                            fontSize: '0.62rem', 
                                            fontWeight: 800, 
                                            padding: '0.15rem 0.45rem', 
                                            borderRadius: '6px', 
                                            background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                                            color: '#ffffff',
                                            letterSpacing: '0.05em'
                                        }}>
                                            {badge}
                                        </span>
                                    )}
                                </span>
                            </NavLink>
                        ))}
                    </div>
                ))}
            </nav>

            {/* User Footer */}
            <div className="sidebar-footer">
                <div className="sidebar-user" title={collapsed ? `${user?.name || 'User'} (${user?.email || ''})` : undefined}>
                    <div className="sidebar-avatar">
                        {getInitials(user?.name)}
                    </div>
                    <div className="sidebar-user-info">
                        <div className="sidebar-user-name">{user?.name || 'User'}</div>
                        <div className="sidebar-user-email">{user?.email || ''}</div>
                    </div>
                    {!collapsed && (
                        <button className="btn-logout" onClick={handleLogout} title="Sign Out">
                            <HiOutlineArrowRightOnRectangle />
                        </button>
                    )}
                </div>
                {collapsed && (
                    <button 
                        className="btn-logout" 
                        onClick={handleLogout} 
                        title="Sign Out" 
                        style={{ width: '100%', justifyContent: 'center', marginTop: '0.4rem' }}
                    >
                        <HiOutlineArrowRightOnRectangle />
                    </button>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
