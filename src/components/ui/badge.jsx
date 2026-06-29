import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:     'border-transparent bg-[#FFD706] text-[#0D0D0B]',
        secondary:   'border-th-border bg-th-border text-th-text',
        success:     'border-transparent bg-[#1a3a1a] text-[#52c41a] border-[#52c41a]',
        destructive: 'border-transparent bg-[#3a1a1a] text-[#FF5810]',
        pending:     'border-th-border bg-transparent text-th-muted',
        locked:      'border-th-border bg-transparent text-th-muted',
        tangerine:   'border-transparent bg-[#FF8200] text-[#0D0D0B]',
        live:        'border-[#FF4444]/40 bg-[#FF4444]/15 text-[#FF4444]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
