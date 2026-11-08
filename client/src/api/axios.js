/**
 * Axios API Instance
 * Pre-configured with environment-based base URL and JWT interceptor
 */
import axios from 'axios';
import { getAIRequestHeaders } from '../ai/providerSettings';

// Use VITE_API_URL from environment or fallback to localhost development URL
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const API = axios.create({
    baseURL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Request interceptor — attach JWT token
API.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    const aiEndpoint = config.url?.split('?')[0];
    if (aiEndpoint?.startsWith('/ai/') &&
        aiEndpoint !== '/ai/config' &&
        aiEndpoint !== '/ai/models') {
        config.headers = config.headers || {};
        Object.assign(config.headers, getAIRequestHeaders());
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Response interceptor — handle 401 (expired or invalid token)
API.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            // Dispatch custom event for AuthContext to sync state cleanly
            window.dispatchEvent(new CustomEvent('auth:unauthorized'));
            // Redirect to login if not already on an auth page
            if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default API;
