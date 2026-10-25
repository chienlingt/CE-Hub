import React from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

const typeStyles = {
  success: {
    icon: CheckCircle,
    colorClass: 'text-green-500',
  },
  error: {
    icon: AlertCircle,
    colorClass: 'text-red-500',
  },
  info: {
    icon: AlertCircle,
    colorClass: 'text-blue-500',
  },
};

const buttonClassNames = (variant = 'primary') => {
  switch (variant) {
    case 'success':
      return 'w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors';
    case 'destructive':
      return 'w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 transition-colors';
    case 'secondary':
      return 'w-full border border-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-50 transition-colors';
    default:
      return 'w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors';
  }
};

export default function ResultModal({
  open,
  type = 'info',
  title,
  message,
  children,
  primaryAction,
  secondaryAction,
  onClose,
}) {
  if (!open) return null;

  const { icon: Icon, colorClass } = typeStyles[type] || typeStyles.info;

  const primary = primaryAction || {
    label: 'Close',
    onClick: onClose,
    variant: 'primary',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="p-6 text-center">
          <Icon className={`w-14 h-14 mx-auto mb-3 ${colorClass}`} />
          <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
          {message && <p className="text-gray-600 mb-4">{message}</p>}

          {children}

          <div className="space-y-2 mt-2">
            {secondaryAction && (
              <button
                onClick={secondaryAction.onClick}
                className={buttonClassNames(secondaryAction.variant || 'secondary')}
              >
                {secondaryAction.label}
              </button>
            )}
            <button
              onClick={primary.onClick}
              className={buttonClassNames(primary.variant)}
            >
              {primary.label}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
