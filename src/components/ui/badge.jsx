import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:     'border-transparent bg-[#FFD706] text-[#0D0D0B]',
        secondary:   'border-[#32312D] bg-[#32312D] text-[#FFFDF2]',
        success:     'border-transparent bg-[#1a3a1a] text-[#52c41a] border-[#52c41a]',
        destructive: 'border-transparent bg-[#3a1a1a] text-[#FF5810]',
        pending:     'border-[#32312D] bg-transparent text-[#807D73]',
        locked:      'border-[#32312D] bg-transparent text-[#807D73]',
        tangerine:   'border-transparent bg-[#FF8200] text-[#0D0D0B]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
