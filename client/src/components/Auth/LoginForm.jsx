import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    HiOutlineEnvelope,
    HiOutlineLockClosed,
    HiOutlineEye,
    HiOutlineEyeSlash,
} from 'react-icons/hi2';
import toast from 'react-hot-toast';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASS = 'demo@123';

const LoginForm = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !password) {
            toast.error('Please fill in all fields');
            return;
        }
        setLoading(true);
        try {
            await login(email, password);
            toast.success('Welcome back!');
            navigate('/');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    const handleDemoLogin = async () => {
        setLoading(true);
        try {
            await login(DEMO_EMAIL, DEMO_PASS);
            toast.success('Logged in as demo user 🎉');
            navigate('/');
        } catch (err) {
            toast.error('Demo login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page auth-split">
            {/* ── Left Hero Panel ── */}
            <div className="auth-left-panel">
                <div className="auth-hero-content">
                    <div className="auth-hero-logo">
                        <div className="auth-hero-logo-icon">💎</div>
                        <div>
                            <h1>FinanceAI</h1>
                            <span>AI Financial Advisor</span>
                        </div>
                    </div>

                    <div className="auth-hero-headline">
                        Your money,<br />
                        <span>intelligently managed</span>
                    </div>

                    <p className="auth-hero-subtitle">
                        Get AI-powered insights on your spending patterns, detect leakages,
                        and build wealth — all in one place.
                    </p>

                    <div className="auth-hero-stats">
                        <div className="auth-hero-stat">
                            <div className="auth-hero-stat-value">₹2L+</div>
                            <div className="auth-hero-stat-label">Avg savings tracked</div>
                        </div>
                        <div className="auth-hero-stat">
                            <div className="auth-hero-stat-value">7</div>
                            <div className="auth-hero-stat-label">AI tools live</div>
                        </div>
                        <div className="auth-hero-stat">
                            <div className="auth-hero-stat-value">100%</div>
                            <div className="auth-hero-stat-label">Private &amp; secure</div>
                        </div>
                    </div>

                    {/* Decorative floating cards */}
                    <div className="auth-hero-float auth-hero-float--1">
                        <span>📈</span> Portfolio up 12% this month
                    </div>
                    <div className="auth-hero-float auth-hero-float--2">
                        <span>🤖</span> AI insight ready
                    </div>
                </div>
            </div>

            {/* ── Right Form Panel ── */}
            <div className="auth-right-panel">
                <div className="auth-container">
                    <div className="auth-card auth-card--flat">
                        <div className="auth-header">
                            <div className="auth-logo">
                                <div className="auth-logo-icon">💎</div>
                                <span className="auth-logo-text">FinanceAI</span>
                            </div>
                            <h1>Welcome back</h1>
                            <p>Sign in to your financial dashboard</p>
                        </div>

                        {/* Demo Login */}
                        <button
                            type="button"
                            className="auth-demo-btn"
                            onClick={handleDemoLogin}
                            disabled={loading}
                        >
                            <span>🎯</span>
                            Try Demo Account — no signup needed
                        </button>

                        <div className="auth-divider">
                            <span>or sign in with your account</span>
                        </div>

                        <form className="auth-form" onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label htmlFor="login-email">Email Address</label>
                                <div className="input-with-icon">
                                    <span className="input-icon">
                                        <HiOutlineEnvelope />
                                    </span>
                                    <input
                                        id="login-email"
                                        type="email"
                                        placeholder="you@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        autoComplete="email"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label htmlFor="login-password">Password</label>
                                <div className="input-with-icon input-with-icon--toggle">
                                    <span className="input-icon">
                                        <HiOutlineLockClosed />
                                    </span>
                                    <input
                                        id="login-password"
                                        type={showPass ? 'text' : 'password'}
                                        placeholder="Enter your password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoComplete="current-password"
                                    />
                                    <button
                                        type="button"
                                        className="input-toggle-btn"
                                        onClick={() => setShowPass((p) => !p)}
                                        aria-label={showPass ? 'Hide password' : 'Show password'}
                                    >
                                        {showPass ? <HiOutlineEyeSlash /> : <HiOutlineEye />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="btn btn-primary auth-submit-btn"
                                disabled={loading}
                            >
                                {loading
                                    ? <span className="spinner" style={{ width: '18px', height: '18px' }} />
                                    : 'Sign In'}
                            </button>
                        </form>

                        <div className="auth-footer">
                            Don't have an account?{' '}
                            <Link to="/register">Create one free</Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginForm;
