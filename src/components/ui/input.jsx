import { cn } from '@/lib/utils'

export function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-th-border bg-[#232920] px-3 py-2 text-sm text-th-text placeholder:text-th-muted focus:outline-none focus:ring-2 focus:ring-[#FFD706] focus:border-[#FFD706] disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
        className
      )}
      {...props}
    />
  )
}
