/**
 * api/client.js — central fetch wrapper for all backend calls.
 *
 * Because Vite proxies /api/* → localhost:8080, all requests are same-origin.
 * credentials: 'include' ensures the JSESSIONID session cookie is sent.
 *
 * Throws an Error with { status, error, message } on non-2xx responses.
 */

const BASE = '/api/v1'

async function request(path, options = {}) {
    const res = await fetch(`${BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        credentials: 'include',
        ...options,
    })

    if (!res.ok) {
        let payload = {}
        try { payload = await res.json() } catch (_) { }
        const err = new Error(payload.message || `HTTP ${res.status}`)
        err.status = res.status
        err.code = payload.error
        err.payload = payload
        throw err
    }

    // 204 No Content → return null
    const ct = res.headers.get('Content-Type') || ''
    return ct.includes('application/json') ? res.json() : null
}

// ── Auth ────────────────────────────────────────────────────────────────
export const authApi = {
    /** Check if current session is valid. Returns { username, authenticated } or throws 401. */
    me: () => fetch('/api/auth/me', { credentials: 'include' }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw Object.assign(new Error(e.message || 'Not authenticated'), { status: r.status }) }
        return r.json()
    }),

    /** Log out — invalidates server-side session. */
    logout: () => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(r => r.json().catch(() => ({}))),
}

// ── Login (uses /login not /api/v1) ─────────────────────────────────────
/** POST form-urlencoded to /login (Spring Security endpoint via Vite proxy). */
export async function login(username, password) {
    const body = new URLSearchParams({ username, password })
    const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw Object.assign(new Error(data.message || 'Login failed'), { status: res.status, code: data.error })
    return data   // { status: 'LOGIN_SUCCESS', user: 'user' }
}

// ── Dashboard stats ───────────────────────────────────────────────────────
/** GET /api/v1/dashboard/stats?date=YYYY-MM-DD */
export const getDashboardStats = (date = today()) =>
    request(`/dashboard/stats?date=${date}`)

// ── Seats ────────────────────────────────────────────────────────────────
/** GET /api/v1/seats/status?date=YYYY-MM-DD */
export const getSeatStatus = (date = today()) =>
    request(`/seats/status?date=${date}`)

/** POST /api/v1/seats/book */
export const bookSeat = (payload) =>
    request('/seats/book', { method: 'POST', body: JSON.stringify(payload) })

/** DELETE /api/v1/seats/book/:bookingId */
export const cancelBooking = (bookingId) =>
    request(`/seats/book/${bookingId}`, { method: 'DELETE' })

// ── Calendar ─────────────────────────────────────────────────────────────
/** GET /api/v1/calendar/weekly?week=1&batch=all */
export const getWeeklyCalendar = (week = 1, batch = 'all') =>
    request(`/calendar/weekly?week=${week}&batch=${batch}`)

// ── Leaves ───────────────────────────────────────────────────────────────
/** POST /api/v1/leaves/apply */
export const applyLeave = (payload) =>
    request('/leaves/apply', { method: 'POST', body: JSON.stringify(payload) })

/** PUT /api/v1/leaves/:id/cancel */
export const cancelLeave = (leaveId) =>
    request(`/leaves/${leaveId}/cancel`, { method: 'PUT' })

// ── helpers ───────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0] }
