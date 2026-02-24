import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { bookSeat, applyLeave } from '../api/client'
import './ActionPanel.css'

/**
 * ActionPanel — role-aware action buttons for the Dashboard overview.
 *
 * Rules (enforced on both frontend and backend):
 *   DESIGNATED: "Apply Leave" always enabled · "Book Seat" never shown
 *   FLOATER:    "Book Seat" enabled after 3 PM · "Apply Leave" never shown
 *
 * The 3 PM gate is a UI hint only — the backend is the authoritative enforcer.
 */
export default function ActionPanel() {
    const { user } = useAuth()

    const [leaveForm, setLeaveForm] = useState(false)
    const [bookForm, setBookForm] = useState(false)
    const [result, setResult] = useState(null)   // { type:'success'|'error', message }
    const [loading, setLoading] = useState(false)

    const isDesignated = user?.role === 'designated'
    const isFloater = user?.role === 'floater'

    // Booking window check: after 15:00 IST or before 08:00 IST
    const now = new Date()
    const hours = now.getHours()
    const minutes = now.getMinutes()
    const totalMinutes = hours * 60 + minutes
    const windowOpen = totalMinutes >= 15 * 60 || totalMinutes < 8 * 60

    // ── Helpers ─────────────────────────────────────────────────────────

    function showResult(type, message) {
        setResult({ type, message })
        setTimeout(() => setResult(null), 6000)
    }

    async function handleLeaveSubmit(e) {
        e.preventDefault()
        const fd = new FormData(e.target)
        setLoading(true)
        try {
            const res = await applyLeave({
                employeeId: user.employeeId,
                leaveType: fd.get('leaveType'),
                startDate: fd.get('startDate'),
                endDate: fd.get('endDate') || fd.get('startDate'),
                halfDay: false,
                reason: fd.get('reason') || '',
            })
            showResult('success', `✅ Leave filed! ID: ${res.leaveId} · Seat ${res.releasedSeatId || '—'} released.`)
            setLeaveForm(false)
            e.target.reset()
        } catch (err) {
            showResult('error', `${err.code ?? 'ERROR'}: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    async function handleBookSubmit(e) {
        e.preventDefault()
        const fd = new FormData(e.target)
        setLoading(true)
        try {
            const bookDate = fd.get('date')
            const seatId = fd.get('seatId').toUpperCase()
            const res = await bookSeat({
                employeeId: user.employeeId,
                seatId,
                date: bookDate,
                batch: user.batch ?? 1,
                week: 1,
            })
            showResult('success', `✅ Seat booked! ID: ${res.bookingId} · ${seatId} on ${bookDate}.`)
            setBookForm(false)
            e.target.reset()
        } catch (err) {
            showResult('error', `${err.code ?? 'ERROR'}: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    // ── Render ───────────────────────────────────────────────────────────
    return (
        <div className="action-panel">
            <div className="ap-header">
                <span className="ap-title">Quick Actions</span>
                <span className={`role-badge ${user?.role}`}>
                    {isDesignated ? '🪑 Designated' : '🔄 Floater'}
                </span>
            </div>

            {/* Result banner */}
            {result && (
                <div className={`ap-result ap-${result.type}`} role="alert">
                    {result.message}
                </div>
            )}

            <div className="ap-buttons">

                {/* ── Apply Leave — DESIGNATED only, always enabled ──────────── */}
                {isDesignated && (
                    <button
                        className="ap-btn ap-btn-leave"
                        onClick={() => { setLeaveForm(f => !f); setBookForm(false) }}
                        disabled={loading}
                    >
                        📋 Apply Leave
                    </button>
                )}

                {/* ── Book Seat — FLOATER only, gated by 3 PM ────────────────── */}
                {isFloater && (
                    <div className="ap-book-wrap">
                        <button
                            className="ap-btn ap-btn-book"
                            onClick={() => { setBookForm(f => !f); setLeaveForm(false) }}
                            disabled={!windowOpen || loading}
                            title={!windowOpen ? 'Seat booking opens at 3:00 PM IST' : 'Book a floater seat'}
                        >
                            💺 Book Seat
                        </button>
                        {!windowOpen && (
                            <span className="ap-window-hint">
                                🕒 Opens at 3 PM · {15 - Math.floor(totalMinutes / 60)}h {60 - minutes}m away
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* ── Leave form ──────────────────────────────────────────────────── */}
            {leaveForm && isDesignated && (
                <form className="ap-form" onSubmit={handleLeaveSubmit}>
                    <div className="ap-form-title">Apply for Leave</div>

                    <div className="ap-row">
                        <div className="ap-field">
                            <label>Leave Type</label>
                            <select name="leaveType" required>
                                <option value="">Select…</option>
                                <option value="CASUAL">Casual</option>
                                <option value="SICK">Sick</option>
                                <option value="EARNED">Earned</option>
                                <option value="COMP_OFF">Comp-off</option>
                            </select>
                        </div>
                        <div className="ap-field">
                            <label>Start Date</label>
                            <input type="date" name="startDate" required
                                min={new Date().toISOString().split('T')[0]} />
                        </div>
                        <div className="ap-field">
                            <label>End Date</label>
                            <input type="date" name="endDate"
                                min={new Date().toISOString().split('T')[0]} />
                        </div>
                    </div>

                    <div className="ap-field ap-field-full">
                        <label>Reason (optional)</label>
                        <input type="text" name="reason" placeholder="e.g. Personal work" />
                    </div>

                    <div className="ap-form-actions">
                        <button type="submit" className="ap-submit" disabled={loading}>
                            {loading ? 'Submitting…' : 'Submit Leave'}
                        </button>
                        <button type="button" className="ap-cancel-btn"
                            onClick={() => setLeaveForm(false)}>Cancel</button>
                    </div>
                </form>
            )}

            {/* ── Book seat form ──────────────────────────────────────────────── */}
            {bookForm && isFloater && windowOpen && (
                <form className="ap-form" onSubmit={handleBookSubmit}>
                    <div className="ap-form-title">Book a Floater Seat</div>

                    <div className="ap-row">
                        <div className="ap-field">
                            <label>Seat ID</label>
                            <input type="text" name="seatId" placeholder="e.g. F-04"
                                pattern="[Ff]-\d{2}" title="Format: F-04" required />
                        </div>
                        <div className="ap-field">
                            <label>Date</label>
                            <input type="date" name="date" required
                                min={new Date().toISOString().split('T')[0]} />
                        </div>
                    </div>

                    <div className="ap-form-actions">
                        <button type="submit" className="ap-submit" disabled={loading}>
                            {loading ? 'Booking…' : 'Confirm Booking'}
                        </button>
                        <button type="button" className="ap-cancel-btn"
                            onClick={() => setBookForm(false)}>Cancel</button>
                    </div>
                </form>
            )}
        </div>
    )
}
