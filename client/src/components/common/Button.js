import React from 'react';
import { FOCUS_RING } from './tokens';

// Promoted out of ResultModal.js, where `buttonClassNames` was a private
// function with exactly these four variants. ResultModal now imports from here,
// so there is one definition rather than two that drift.

const VARIANTS = {
  primary:     'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
  success:     'bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300',
  destructive: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  secondary:   'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:text-gray-400',
  ghost:       'text-gray-600 hover:bg-gray-100 disabled:text-gray-400',
  alert:       'border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:text-red-300',
  tint:        'border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:text-indigo-300',
};

const SIZES = {
  sm: 'min-h-8 px-2.5 py-1 text-xs',
  md: 'min-h-10 px-3 py-1.5 text-sm',
  lg: 'min-h-11 px-4 py-2 text-sm',
};

/** The class string, for the rare case a non-button element needs it. */
export function buttonClassNames(variant = 'primary', size = 'md', fullWidth = false) {
  return [
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
    'disabled:cursor-not-allowed',
    FOCUS_RING,
    VARIANTS[variant] ?? VARIANTS.primary,
    SIZES[size] ?? SIZES.md,
    fullWidth ? 'w-full' : '',
  ].join(' ');
}

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon: Icon = null,
  children,
  className = '',
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      className={`${buttonClassNames(variant, size, fullWidth)} ${className}`}
      {...rest}
    >
      {Icon && <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />}
      {children}
    </button>
  );
}
