import { createContext, useContext, useState, useCallback } from 'react'
import { X, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback(({ title, variant = 'default' }) => {
    const id = Date.now()
    setToasts(p => [...p, { id, title, variant }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }, [])

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg pointer-events-auto',
              'animate-in slide-in-from-bottom-2 fade-in-0',
              t.variant === 'destructive'
                ? 'border-[#FF5810] bg-[#1a0a05] text-[#FF5810]'
                : 'border-[#52c41a] bg-[#0a1a0a] text-[#52c41a]'
            )}
          >
            {t.variant === 'destructive'
              ? <AlertCircle className="h-4 w-4 shrink-0" />
              : <CheckCircle className="h-4 w-4 shrink-0" />}
            {t.title}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}
