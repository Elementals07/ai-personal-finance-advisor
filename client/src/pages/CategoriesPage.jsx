import { useState } from 'react';
import { useCategories } from '../hooks/useCategories';
import { HiOutlinePlus, HiOutlineTrash, HiOutlinePencil, HiOutlineCheck, HiOutlineSwatch } from 'react-icons/hi2';
import toast from 'react-hot-toast';

const PRESET_COLORS = [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', 
    '#ec4899', '#06b6d4', '#6366f1', '#f43f5e', '#14b8a6',
    '#84cc16', '#eab308', '#d946ef', '#0ea5e9', '#64748b',
    '#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed',
    '#475569', '#0891b2', '#be123c', '#4338ca', '#15803d'
];

const CategoriesPage = () => {
    const { categories, addCategory, deleteCategory, updateCategory, loading } = useCategories();
    const [newName, setNewName] = useState('');
    const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
    const [isAdding, setIsAdding] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [editColor, setEditColor] = useState('');

    const usedColors = new Set(categories.map(c => c.color.toLowerCase()));

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!newName.trim()) return;
        
        const success = await addCategory(newName.trim(), selectedColor);
        if (success) {
            setNewName('');
            setIsAdding(false);
        }
    };

    const handleUpdateColor = async (id, color) => {
        const success = await updateCategory(id, color);
        if (success) {
            setEditingCategory(null);
        }
    };

    return (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1rem 5rem' }}>
            <div className="page-header" style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>Expense Categories</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem' }}>Manage your spending sectors and custom visual palette</p>
                </div>
                {!isAdding && !editingCategory && (
                    <button 
                        className="btn btn-primary" 
                        onClick={() => setIsAdding(true)}
                        style={{ padding: '0.8rem 1.6rem', borderRadius: '14px', fontWeight: 600 }}
                    >
                        <HiOutlinePlus /> Create Sector
                    </button>
                )}
            </div>

            {/* Create/Edit Form Area */}
            {(isAdding || editingCategory) && (
                <div className="card" style={{ 
                    marginBottom: '3rem', 
                    animation: 'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                    background: 'white',
                    padding: '2.5rem',
                    borderRadius: '24px',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.04)',
                    border: '1px solid rgba(0,0,0,0.03)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                            {isAdding ? '🚀 Create New Sector' : `🎨 Edit Sector: ${editingCategory.name}`}
                        </h2>
                        <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.5rem 1rem', borderRadius: '10px' }}
                            onClick={() => { setIsAdding(false); setEditingCategory(null); }}
                        >
                            Cancel
                        </button>
                    </div>

                    <form onSubmit={isAdding ? handleAdd : (e) => { e.preventDefault(); handleUpdateColor(editingCategory.id, editColor); }}>
                        <div style={{ display: 'grid', gridTemplateColumns: isAdding ? '1fr 1.5fr' : '1fr', gap: '3rem' }}>
                            {isAdding && (
                                <div className="form-group">
                                    <label style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Sector Name</label>
                                    <input 
                                        type="text"
                                        placeholder="e.g. Subscriptions, Hobbies..."
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        style={{ 
                                            padding: '1.2rem', 
                                            borderRadius: '16px', 
                                            fontSize: '1.1rem',
                                            border: '2px solid #f1f5f9',
                                            background: '#f8fafc'
                                        }}
                                        autoFocus
                                        required
                                    />
                                </div>
                            )}
                            
                            <div className="form-group">
                                <label style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                                    Select Visual Color {isAdding ? '' : '(Updating for ' + editingCategory.name + ')'}
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(42px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                                    {PRESET_COLORS.map(color => {
                                        const isUsed = usedColors.has(color.toLowerCase());
                                        const isSelected = (isAdding ? selectedColor : editColor) === color;
                                        return (
                                            <div key={color} style={{ position: 'relative' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => isAdding ? setSelectedColor(color) : setEditColor(color)}
                                                    style={{
                                                        width: '42px',
                                                        height: '42px',
                                                        borderRadius: '14px',
                                                        backgroundColor: color,
                                                        border: isSelected ? '4px solid #0f172a' : '2px solid transparent',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                                                        transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        boxShadow: isSelected ? '0 10px 20px rgba(0,0,0,0.1)' : 'none'
                                                    }}
                                                    title={isUsed ? `Used Color: ${color}` : color}
                                                >
                                                    {isSelected && <HiOutlineCheck style={{ color: 'white', fontSize: '1.2rem' }} />}
                                                </button>
                                                {isUsed && !isSelected && (
                                                    <div style={{ 
                                                        position: 'absolute', 
                                                        bottom: '-18px', 
                                                        left: '50%', 
                                                        transform: 'translateX(-50%)',
                                                        fontSize: '0.65rem',
                                                        fontWeight: 800,
                                                        color: 'var(--text-muted)',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        USED
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div style={{ marginTop: '2.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '2rem' }}>
                            <button type="submit" className="btn btn-primary" style={{ padding: '1rem 3rem', borderRadius: '16px', fontSize: '1.1rem', boxShadow: '0 8px 20px rgba(59, 130, 246, 0.3)' }}>
                                {isAdding ? '🚀 Add Category' : '✨ Apply Color Change'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="card" style={{ padding: '2.5rem', borderRadius: '24px', border: '1px solid rgba(0,0,0,0.03)' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <HiOutlineSwatch style={{ color: 'var(--text-muted)' }} /> Your Sectors
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                    {loading ? (
                        [...Array(6)].map((_, i) => (
                            <div key={i} className="loading-skeleton" style={{ height: '80px', borderRadius: '20px' }} />
                        ))
                    ) : (
                        categories.map(cat => (
                            <div 
                                key={cat.id || cat.name} 
                                style={{ 
                                    padding: '1.5rem', 
                                    borderRadius: '20px', 
                                    background: '#f8fafc', 
                                    border: '1px solid #f1f5f9',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.03)'}
                                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ 
                                        width: '20px', 
                                        height: '20px', 
                                        borderRadius: '8px', 
                                        backgroundColor: cat.color,
                                        boxShadow: `0 4px 10px ${cat.color}44`
                                    }} />
                                    <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{cat.name}</span>
                                    {!cat.user_id && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: '#e2e8f0', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>DEFAULT</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {cat.user_id && (
                                        <>
                                            <button 
                                                onClick={() => { setEditingCategory(cat); setEditColor(cat.color); setIsAdding(false); }}
                                                className="icon-btn"
                                                title="Edit color"
                                                style={{ color: '#64748b', background: 'white', padding: '8px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}
                                            >
                                                <HiOutlinePencil size={18} />
                                            </button>
                                            <button 
                                                onClick={() => deleteCategory(cat.id)}
                                                className="icon-btn"
                                                style={{ color: '#ef4444', background: 'white', padding: '8px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}
                                                title="Delete sector"
                                            >
                                                <HiOutlineTrash size={18} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default CategoriesPage;
