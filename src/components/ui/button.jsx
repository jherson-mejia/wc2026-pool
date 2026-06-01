import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD706] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:     'bg-[#FFD706] text-[#0D0D0B] hover:bg-[#e8c200] active:scale-[0.98]',
        secondary:   'bg-[#32312D] text-[#FFFDF2] border border-[#32312D] hover:border-[#FFD706] hover:text-[#FFD706]',
        destructive: 'bg-[#FF5810] text-[#FFFDF2] hover:bg-[#e04e0e]',
        ghost:       'hover:bg-[#32312D] hover:text-[#FFFDF2]',
        link:        'text-[#FFD706] underline-offset-4 hover:underline',
        outline:     'border border-[#32312D] bg-transparent hover:border-[#FFD706] hover:text-[#FFD706]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm:      'h-8 px-3 text-xs',
        lg:      'h-12 px-6 text-base',
        icon:    'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
