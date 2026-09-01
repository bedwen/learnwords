import React from 'react';

type BadgeProps = {
  children: React.ReactNode;
  variant?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'New' | 'Learning' | 'Familiar' | 'Strong' | 'Mastered' | 'default';
};

export function Badge({ children, variant = 'default' }: BadgeProps) {
  let colorClass = 'bg-surface-200 text-surface-700';

  switch (variant) {
    case 'A1':
      colorClass = 'bg-teal-100 text-teal-700';
      break;
    case 'A2':
      colorClass = 'bg-indigo-100 text-indigo-700';
      break;
    case 'B1':
      colorClass = 'bg-blue-100 text-blue-700';
      break;
    case 'B2':
      colorClass = 'bg-green-100 text-green-700';
      break;
    case 'C1':
      colorClass = 'bg-orange-100 text-orange-700';
      break;
    case 'C2':
      colorClass = 'bg-purple-100 text-purple-700';
      break;
    case 'New':
      colorClass = 'bg-surface-200 text-surface-600';
      break;
    case 'Learning':
      colorClass = 'bg-purple-100 text-purple-700';
      break;
    case 'Familiar':
      colorClass = 'bg-blue-100 text-blue-700';
      break;
    case 'Strong':
      colorClass = 'bg-amber-100 text-amber-700';
      break;
    case 'Mastered':
      colorClass = 'bg-green-100 text-green-700';
      break;
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${colorClass}`}>
      {children}
    </span>
  );
}
