import React from 'react';
import type { OnboardingStepStatus } from '../types.ts';

interface OnboardingStepProps {
  label: string;
  status: OnboardingStepStatus;
  onAction: () => void;
  onRetry?: () => void;
}

export function OnboardingStep({ label, status, onAction, onRetry }: OnboardingStepProps) {
  const actionButtonClass =
    'px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-gray-900">{label}</span>

        {status === 'incomplete' && (
          <button className={actionButtonClass} onClick={onAction}>
            Start
          </button>
        )}

        {status === 'loading' && (
          <div className="flex items-center gap-2">
            <svg
              className="animate-spin h-5 w-5 text-indigo-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-label="Loading"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <button className={actionButtonClass} disabled>
              Start
            </button>
          </div>
        )}

        {status === 'complete' && (
          <svg
            className="h-5 w-5 text-green-500"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-label="Complete"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>

      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-2">
          <span>Unable to save progress. Please try again.</span>
          <button
            className={actionButtonClass}
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export default OnboardingStep;
