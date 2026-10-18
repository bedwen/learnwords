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
        // Learning Statuses — Organic Maturation Progression
        New: 'bg-stone-500/10 text-stone-600 dark:text-stone-300 border border-stone-500/20',
        Learning: 'bg-amber-500/12 text-amber-800 dark:text-amber-300 border border-amber-500/25',
        Familiar: 'bg-teal-600/12 text-teal-800 dark:text-teal-300 border border-teal-600/25',
        Strong: 'bg-emerald-600/12 text-emerald-800 dark:text-emerald-300 border border-emerald-600/25',
        Mastered: 'bg-indigo-600/12 text-indigo-800 dark:text-indigo-300 border border-indigo-600/25',
        // Psychological Recall Variants
        again: 'bg-recall-again/12 text-recall-again border border-recall-again/25',
        hard: 'bg-recall-hard/12 text-recall-hard border border-recall-hard/25',
        good: 'bg-recall-good/12 text-recall-good border border-recall-good/25',
        easy: 'bg-recall-easy/12 text-recall-easy border border-recall-easy/25',
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
