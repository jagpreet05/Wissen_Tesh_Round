import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import './Login.css'

export default function Login() {
    const { login } = useAuth()
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e) {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            await login(username, password)
            // AuthProvider sets user → App.jsx GuestRoute redirects to /dashboard
        } catch (err) {
            setError(err.message || 'Login failed. Try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-bg">
            <div className="login-card">
                {/* Logo area */}
                <div className="login-logo">
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                        <rect width="40" height="40" rx="10" fill="url(#grad)" />
                        <path d="M10 28V16l10-6 10 6v12l-10 6-10-6z" stroke="#fff" strokeWidth="2" fill="none" />
                        <circle cx="20" cy="20" r="3" fill="#fff" />
                        <defs>
                            <linearGradient id="grad" x1="0" y1="0" x2="40" y2="40">
                                <stop offset="0%" stopColor="#6366f1" />
                                <stop offset="100%" stopColor="#3b82f6" />
                            </linearGradient>
                        </defs>
                    </svg>
                </div>
                <h1 className="login-title">Smart Seat System</h1>
                <p className="login-sub">Sign in with your Wissen credentials</p>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="field">
                        <label htmlFor="username">Username</label>
                        <input
                            id="username"
                            type="text"
                            autoComplete="username"
                            placeholder="e.g. user"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            disabled={loading}
                            required
                        />
                    </div>

                    <div className="field">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            autoComplete="current-password"
                            placeholder="••••••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            disabled={loading}
                            required
                        />
                    </div>

                    {error && <div className="login-error" role="alert">{error}</div>}

                    <button type="submit" className="login-btn" disabled={loading}>
                        {loading ? 'Signing in…' : 'Sign In'}
                    </button>
                </form>

                <p className="login-hint">
                    Backend must be running on <code>localhost:8080</code>
                </p>
            </div>
        </div>
    )
}
