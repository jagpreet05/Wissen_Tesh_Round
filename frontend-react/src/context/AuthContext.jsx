import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi, login as apiLogin } from '../api/client'

/**
 * AuthContext — global auth state shared by all components.
 *
 * Exposes:
 *   user        — { username } when logged in, null when not
 *   loading     — true while checking session on mount
 *   login(u,p)  — POST /login, sets user on success, throws on failure
 *   logout()    — POST /api/auth/logout, clears user
 */
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)   // checking session on mount

    // On first load, verify if an active session exists
    useEffect(() => {
        authApi.me()
            .then(data => setUser(data))
            .catch(() => setUser(null))
            .finally(() => setLoading(false))
    }, [])

    const login = useCallback(async (username, password) => {
        const data = await apiLogin(username, password)
        setUser({ username: data.user })
        return data
    }, [])

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

/** Hook — access auth context from any component. */
export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be inside AuthProvider')
    return ctx
}
