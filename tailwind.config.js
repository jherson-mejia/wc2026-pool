/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Theme-aware tokens (CSS variable backed)
        'th-bg':          'var(--th-bg)',
        'th-surface':     'var(--th-surface)',
        'th-surface-alt': 'var(--th-surface-alt)',
        'th-border':      'var(--th-border)',
        'th-text':        'var(--th-text)',
        'th-muted':       'var(--th-muted)',
        'th-subtle':      'var(--th-subtle)',
        // Recurly brand palette
        recurly: {
          yellow:      '#FFD706',
          'off-black': '#0D0D0B',
          'dark-gray': '#32312D',
          gray:        '#807D73',
          'light-gray':'#CCC9B8',
          'bright-gray':'#F1EFE3',
          'off-white': '#FFFDF2',
          tangerine:   '#FF8200',
          salmon:      '#FF9D88',
          vermillion:  '#FF5810',
          'dark-navy': '#343F4B',
          charcoal:    '#232932',
        },
        // shadcn/ui CSS variable overrides
        border:      'hsl(var(--border))',
        input:       'hsl(var(--input))',
        ring:        'hsl(var(--ring))',
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}
