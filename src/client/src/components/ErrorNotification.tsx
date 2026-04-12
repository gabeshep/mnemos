import React from 'react';

interface ErrorNotificationProps {
  error: string | null;
  code?: string;
  retryable?: boolean;
  retryAfter?: number | null;
  onDismiss?: () => void;
}

export function ErrorNotification({ error, code, retryAfter, onDismiss }: ErrorNotificationProps) {
  if (!error) return null;

  let message: string;
  if (code === 'rate_limit') {
    message = 'Claude is currently busy. Please wait a moment and try again.';
    if (retryAfter != null) {
      message += ` Retry in ${retryAfter}s.`;
    }
  } else if (code === 'auth_error') {
    message = 'API configuration error. Please contact your administrator.';
  } else if (code === 'network_error') {
    message = 'Could not connect to Claude. Please try again.';
  } else {
    message = error;
  }

  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start justify-between gap-2">
      <span>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-400 hover:text-red-600 font-medium leading-none flex-shrink-0" aria-label="Dismiss">×</button>
      )}
    </div>
  );
}

export default ErrorNotification;
