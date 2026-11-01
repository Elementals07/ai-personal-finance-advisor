import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout/Layout';
import DashboardPage from './pages/DashboardPage';
import ExpensesPage from './pages/ExpensesPage';
import BudgetPage from './pages/BudgetPage';
import AIInsightsPage from './pages/AIInsightsPage';
import CategoriesPage from './pages/CategoriesPage';
import SavingsPage from './pages/SavingsPage';
import GuidePage from './pages/GuidePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import './App.css';

/** Protected Route wrapper — redirects to login if not authenticated */
const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    
    if (loading) {
        return (
            <div style={{ 
                minHeight: '100vh', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
            }}>
                <div className="spinner" style={{ width: '40px', height: '40px' }} />
            </div>
        );
    }

    return isAuthenticated ? children : <Navigate to="/login" replace />;
};

/** Public Route wrapper — redirects to dashboard if already authenticated */
const PublicRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    
    if (loading) {
        return (
            <div style={{ 
                minHeight: '100vh', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
            }}>
                <div className="spinner" style={{ width: '40px', height: '40px' }} />
            </div>
        );
    }

    return isAuthenticated ? <Navigate to="/" replace /> : children;
};

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Toaster
                    position="top-right"
                    toastOptions={{
                        duration: 3000,
                        style: {
                            background: '#ffffff',
                            color: '#1e293b',
                            border: '1px solid #e2e8f0',
                            borderRadius: '12px',
                            fontSize: '0.9rem',
                            fontFamily: 'Inter, sans-serif',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                        },
                        success: {
                            iconTheme: { primary: '#10b981', secondary: '#ffffff' }
                        },
                        error: {
                            iconTheme: { primary: '#ef4444', secondary: '#ffffff' }
                        }
                    }}
                />
                <Routes>
                    {/* Public Routes */}
                    <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
                    <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

                    {/* Protected Routes */}
                    <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                        <Route index element={<DashboardPage />} />
                        <Route path="expenses" element={<ExpensesPage />} />
                        <Route path="budget" element={<BudgetPage />} />
                        <Route path="sectors" element={<CategoriesPage />} />
                        <Route path="savings" element={<SavingsPage />} />
                        <Route path="ai-insights" element={<AIInsightsPage />} />
                        <Route path="guide" element={<GuidePage />} />
                    </Route>

                    {/* Catch-all */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
