import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    HiOutlineUser,
    HiOutlineEnvelope,
    HiOutlineLockClosed,
    HiOutlineEye,
    HiOutlineEyeSlash,
    HiOutlineCurrencyRupee,
} from 'react-icons/hi2';
import toast from 'react-hot-toast';

const RegisterForm = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name || !email || !password) {
            toast.error('Please fill in all fields');
            return;
        }
        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }
        if (password.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }
        setLoading(true);
        try {
            await register(name, email, password);
            toast.success('Account created successfully!');
            navigate('/');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Registration failed');
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
                        Join thousands of users who track spending, uncover savings
                        opportunities, and grow their wealth with AI-powered guidance.
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
                        <span>🎉</span> Free forever plan available
                    </div>
                    <div className="auth-hero-float auth-hero-float--2">
                        <span>🔒</span> Bank-grade security
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
                            <h1>Create account</h1>
                            <p>Start managing your finances with AI</p>
                        </div>

                        <form className="auth-form" onSubmit={handleSubmit}>
                            {/* Full Name */}
                            <div className="form-group">
                                <label htmlFor="register-name">Full Name</label>
                                <div className="input-with-icon">
                                    <span className="input-icon">
                                        <HiOutlineUser />
                                    </span>
                                    <input
                                        id="register-name"
                                        type="text"
                                        placeholder="John Doe"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        autoComplete="name"
                                    />
                                </div>
                            </div>

                            {/* Email */}
                            <div className="form-group">
                                <label htmlFor="register-email">Email Address</label>
                                <div className="input-with-icon">
                                    <span className="input-icon">
                                        <HiOutlineEnvelope />
                                    </span>
                                    <input
                                        id="register-email"
                                        type="email"
                                        placeholder="you@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        autoComplete="email"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div className="form-group">
                                <label htmlFor="register-password">Password</label>
                                <div className="input-with-icon input-with-icon--toggle">
                                    <span className="input-icon">
                                        <HiOutlineLockClosed />
                                    </span>
                                    <input
                                        id="register-password"
                                        type={showPass ? 'text' : 'password'}
                                        placeholder="Min. 6 characters"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoComplete="new-password"
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

                            {/* Confirm Password */}
                            <div className="form-group">
                                <label htmlFor="register-confirm">Confirm Password</label>
                                <div className="input-with-icon input-with-icon--toggle">
                                    <span className="input-icon">
                                        <HiOutlineLockClosed />
                                    </span>
                                    <input
                                        id="register-confirm"
                                        type={showConfirm ? 'text' : 'password'}
                                        placeholder="Re-enter password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className="input-toggle-btn"
                                        onClick={() => setShowConfirm((p) => !p)}
                                        aria-label={showConfirm ? 'Hide password' : 'Show password'}
                                    >
                                        {showConfirm ? <HiOutlineEyeSlash /> : <HiOutlineEye />}
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
                                    : 'Create Account'}
                            </button>
                        </form>

                        <div className="auth-footer">
                            Already have an account?{' '}
                            <Link to="/login">Sign in</Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RegisterForm;
