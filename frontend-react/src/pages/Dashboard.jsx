import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDashboardStats, getSeatStatus, getWeeklyCalendar } from '../api/client'
import StatCard from '../components/StatCard'
import SeatGrid from '../components/SeatGrid'
import CalendarTable from '../components/CalendarTable'
import './Dashboard.css'

export default function Dashboard() {
    const { user, logout } = useAuth()

    const [stats, setStats] = useState(null)
    const [seats, setSeats] = useState([])
    const [cal1, setCal1] = useState(null)
    const [cal2, setCal2] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [activeTab, setActiveTab] = useState('overview')
    const [calWeek, setCalWeek] = useState(1)

    useEffect(() => {
        setLoading(true)
        const today = new Date().toISOString().split('T')[0]

        Promise.all([
            getDashboardStats(today),
            getSeatStatus(today),
            getWeeklyCalendar(1, 'all'),
            getWeeklyCalendar(2, 'all'),
        ])
            .then(([statsData, seatData, calData1, calData2]) => {
                setStats(statsData)
                // unwrap { seats: [...] } or plain array
                setSeats(Array.isArray(seatData) ? seatData : (seatData?.seats ?? []))
                setCal1(calData1)
                setCal2(calData2)
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false))
    }, [])

    const today = new Date()
    const dateStr = today.toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })

    return (
        <div className="dash-root">
            {/* ── Sidebar ─────────────────────────────────────────────── */}
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
                        <rect width="40" height="40" rx="9" fill="url(#sg)" />
                        <path d="M10 28V16l10-6 10 6v12l-10 6-10-6z" stroke="#fff" strokeWidth="2" fill="none" />
                        <circle cx="20" cy="20" r="3" fill="#fff" />
                        <defs>
                            <linearGradient id="sg" x1="0" y1="0" x2="40" y2="40">
                                <stop offset="0%" stopColor="#6366f1" />
                                <stop offset="100%" stopColor="#3b82f6" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <span>SeatSmart</span>
                </div>

                <nav className="sidebar-nav">
                    {[
                        { id: 'overview', icon: '▦', label: 'Overview' },
                        { id: 'seats', icon: '⊞', label: 'Seats' },
                        { id: 'calendar', icon: '⊟', label: 'Calendar' },
                    ].map(item => (
                        <button
                            key={item.id}
                            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(item.id)}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="sidebar-user">
                    <div className="user-av">{user?.username?.[0]?.toUpperCase()}</div>
                    <div className="user-info">
                        <div className="user-name">{user?.username}</div>
                        <div className="user-role">Employee</div>
                    </div>
                    <button className="logout-btn" title="Sign out" onClick={logout}>↩</button>
                </div>
            </aside>

            {/* ── Main ────────────────────────────────────────────────── */}
            <main className="dash-main">
                <header className="dash-header">
                    <div>
                        <h1 className="page-title">
                            {activeTab === 'overview' ? 'Dashboard' : activeTab === 'seats' ? 'Seat Map' : 'Weekly Calendar'}
                        </h1>
                        <p className="page-date">{dateStr}</p>
                    </div>
                </header>

                {loading && (
                    <div className="dash-loading">
                        <div className="spinner" />
                        <span>Loading data…</span>
                    </div>
                )}

                {error && !loading && (
                    <div className="dash-error">
                        ⚠ {error}
                    </div>
                )}

                {!loading && !error && (
                    <>
                        {/* ── Overview tab ───────────────────────────────── */}
                        {activeTab === 'overview' && (
                            <div className="overview-content">
                                <div className="stats-grid">
                                    <StatCard label="Total Employees" value={stats?.totalEmployees ?? '—'} icon="👥" color="#6366f1" />
                                    <StatCard label="Seats Occupied" value={stats?.occupiedSeats ?? '—'} icon="💺" color="#3b82f6" />
                                    <StatCard label="Available Seats" value={stats?.availableSeats ?? '—'} icon="✅" color="#10b981" />
                                    <StatCard label="On Leave Today" value={stats?.leavesToday ?? '—'} icon="🏖️" color="#f59e0b" />
                                    <StatCard label="Utilization" value={stats ? `${stats.utilizationPercent}%` : '—'} icon="📊" color="#8b5cf6" />
                                    <StatCard label="Leave‑Released" value={stats?.leaveReleasedToPool ?? '—'} icon="🔄" color="#06b6d4" />
                                </div>

                                <div className="section-title">Today's Seat Overview</div>
                                <SeatGrid seats={seats} compact />
                            </div>
                        )}

                        {/* ── Seats tab ──────────────────────────────────── */}
                        {activeTab === 'seats' && (
                            <div>
                                <SeatGrid seats={seats} />
                            </div>
                        )}

                        {/* ── Calendar tab ───────────────────────────────── */}
                        {activeTab === 'calendar' && (
                            <div>
                                <div className="week-tabs">
                                    <button className={`week-tab ${calWeek === 1 ? 'active' : ''}`} onClick={() => setCalWeek(1)}>Week 1 (Batch 1)</button>
                                    <button className={`week-tab ${calWeek === 2 ? 'active' : ''}`} onClick={() => setCalWeek(2)}>Week 2 (Batch 2)</button>
                                </div>
                                <CalendarTable data={calWeek === 1 ? cal1 : cal2} />
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    )
}
