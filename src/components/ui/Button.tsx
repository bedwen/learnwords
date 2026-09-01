import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({ children, variant = 'primary', className = '', ...props }: ButtonProps) {
  let baseClass = 'inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  if (variant === 'primary') {
    baseClass += ' bg-surface-900 text-white hover:bg-surface-800 focus:ring-surface-900';
  } else if (variant === 'secondary') {
    baseClass += ' bg-white text-surface-700 border border-surface-200 hover:bg-surface-50 focus:ring-surface-500';
  } else if (variant === 'danger') {
    baseClass += ' bg-white text-red-600 border border-red-200 hover:bg-red-50 focus:ring-red-500';
  }

  return (
    <button className={`${baseClass} disabled:opacity-50 disabled:cursor-not-allowed ${className}`} {...props}>
      {children}
    </button>
  );
}
