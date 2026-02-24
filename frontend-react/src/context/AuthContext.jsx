import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi, login as apiLogin } from '../api/client'

/**
 * AuthContext — global auth + user profile state.
 *
 * Exposes:
 *   user        — full profile { username, employeeId, name, batch, team, role, designatedSeat }
 *                 null when not logged in
 *   loading     — true while checking session on first mount
 *   login(u,p)  — POST /login → GET /api/auth/me → sets user
 *   logout()    — POST /api/auth/logout → clears user
 *
 * Session persistence:
 *   On every page load (mount), AuthContext calls /api/auth/me.
 *   If the JSESSIONID cookie is still valid, the backend returns the profile
 *   and the user stays logged in without re-entering credentials.
 */
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

    // ── On mount: restore session from existing cookie ──────────────────
    useEffect(() => {
        authApi.me()
            .then(profile => setUser(profile))
            .catch(() => setUser(null))
            .finally(() => setLoading(false))
    }, [])

    // ── Login: POST /login → fetch full profile → store ─────────────────
    const login = useCallback(async (username, password) => {
        // Step 1: authenticate (sets JSESSIONID cookie)
        await apiLogin(username, password)

        // Step 2: fetch full profile using the new session
        const profile = await authApi.me()
        setUser(profile)
        return profile
    }, [])

    // ── Logout: invalidate session → clear state ─────────────────────────
    const logout = useCallback(async () => {
        await authApi.logout().catch(() => { })
        setUser(null)
    }, [])

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

/** Hook — use auth + user profile from any component. */
export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be inside <AuthProvider>')
    return ctx
}
