import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { ToastProvider } from '@/components/ui/toast'
import Header from '@/components/Header'
import Setup from '@/pages/Setup'
import Login from '@/pages/Login'
import Leaderboard from '@/pages/Leaderboard'
import Picks from '@/pages/Picks'
import Admin from '@/pages/Admin'

function AuthGate({ children }) {
  const { user, ready, mode } = useApp()
  const nav = useNavigate()

  useEffect(() => {
    if (!ready) return
    if (!mode)  { nav('/setup', { replace: true }); return }
    if (!user)  { nav('/login', { replace: true }); return }
  }, [ready, mode, user])

  if (!ready || !user) return null
  return children
}

function AdminSetupGate({ children }) {
  const { user, ready, mode, isAdmin } = useApp()
  const nav = useNavigate()

  useEffect(() => {
    if (!ready) return
    if (!mode)  return // allow through — first-time setup
    if (!user || !isAdmin) { nav('/login', { replace: true }); return }
  }, [ready, mode, user, isAdmin])

  if (!ready) return null
  if (mode && (!user || !isAdmin)) return null
  return children
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/setup" element={<AdminSetupGate><Setup /></AdminSetupGate>} />
        <Route path="/login" element={<Login />} />

        <Route path="/*" element={
          <AuthGate>
            <div className="min-h-screen bg-[#0D0D0B]">
              <Header />
              <main>
                <Routes>
                  <Route path="/leaderboard" element={<Leaderboard />} />
                  <Route path="/picks"       element={<Picks />} />
                  <Route path="/admin"       element={<Admin />} />
                  <Route path="*"            element={<Navigate to="/leaderboard" replace />} />
                </Routes>
              </main>
            </div>
          </AuthGate>
        } />
      </Routes>
    </ToastProvider>
  )
}
