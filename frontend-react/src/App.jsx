import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

/** Redirects to /login if not authenticated; shows spinner while checking. */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="splash">Checking session…</div>
  return user ? children : <Navigate to="/login" replace />
}

/** Redirects already-logged-in users away from /login. */
function GuestRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="splash">Checking session…</div>
  return !user ? children : <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={<GuestRoute><Login /></GuestRoute>}
          />
          <Route
            path="/dashboard"
            element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
          />
          {/* Default: redirect / → /dashboard (or /login if not authed) */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
