import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors select-none',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-xs',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'bg-destructive text-destructive-foreground shadow-xs',
        outline:
          'border border-border text-foreground',
        // CEFR levels with polished subtle tones and borders
        A1: 'bg-rose-400/15 text-rose-700 dark:text-rose-300 border border-rose-400/30',
        A2: 'bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30',
        B1: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30',
        B2: 'bg-blue-600/15 text-blue-700 dark:text-blue-300 border border-blue-600/30',
        C1: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
        C2: 'bg-emerald-700/20 text-emerald-800 dark:text-emerald-200 border border-emerald-600/40',
        // Learning Statuses
        New: 'bg-surface-200/70 text-surface-700 dark:bg-surface-800 dark:text-surface-300 border border-surface-300/30',
        Learning: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20',
        Familiar: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20',
        Strong: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20',
        Mastered: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
