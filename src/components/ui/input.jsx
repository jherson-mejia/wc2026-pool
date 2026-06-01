import { cn } from '@/lib/utils'

export function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-[#32312D] bg-[#232920] px-3 py-2 text-sm text-[#FFFDF2] placeholder:text-[#807D73] focus:outline-none focus:ring-2 focus:ring-[#FFD706] focus:border-[#FFD706] disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
        className
      )}
      {...props}
    />
  )
}
