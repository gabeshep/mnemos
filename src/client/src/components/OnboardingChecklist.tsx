import React, { useState, useEffect } from 'react';
import { api } from '../api.ts';
import { useOnboarding } from '../hooks/useOnboarding.ts';
import { OnboardingStep } from './OnboardingStep.tsx';

interface ChecklistItem {
  label: string;
  uuid: string;
  state: Record<string, unknown>;
}

interface OnboardingChecklistProps {
  items: ChecklistItem[];
  onAllComplete?: () => void;
}

export function OnboardingChecklist({ items, onAllComplete }: OnboardingChecklistProps) {
  const [flagsLoaded, setFlagsLoaded] = useState(false);
  const [inlineErrorsEnabled, setInlineErrorsEnabled] = useState(false);

  useEffect(() => {
    api.getFlags()
      .then((flags) => {
        setInlineErrorsEnabled(flags.onboarding_inline_errors);
      })
      .catch(() => {
        setInlineErrorsEnabled(false);
      })
      .finally(() => {
        setFlagsLoaded(true);
      });
  }, []);

  const { steps, executeStep, retryStep } = useOnboarding(items.length, inlineErrorsEnabled);

  useEffect(() => {
    if (steps.length > 0 && steps.every((s) => s.status === 'complete')) {
      onAllComplete?.();
    }
  }, [steps, onAllComplete]);

  if (!flagsLoaded) {
    return (
      <div className="flex items-center justify-center py-8">
        <svg
          className="animate-spin h-6 w-6 text-indigo-600"
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item, i) => (
        <OnboardingStep
          key={item.uuid}
          label={item.label}
          status={steps[i]?.status ?? 'incomplete'}
          onAction={() => executeStep(i, item.uuid, item.state)}
          onRetry={() => retryStep(i)}
        />
      ))}
    </div>
  );
}

export default OnboardingChecklist;
