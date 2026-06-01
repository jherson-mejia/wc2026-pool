import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { ToastProvider } from '@/components/ui/toast'
import Header from '@/components/Header'
import Login from '@/pages/Login'
import Leaderboard from '@/pages/Leaderboard'
import Picks from '@/pages/Picks'
import Admin from '@/pages/Admin'

function AuthGate({ children }) {
  const { user, ready } = useApp()
  const nav = useNavigate()

  useEffect(() => {
    if (ready && !user) nav('/login', { replace: true })
  }, [ready, user])

  if (!ready || !user) return null
  return children
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
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
