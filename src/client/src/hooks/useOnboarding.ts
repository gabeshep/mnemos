import { useState, useCallback } from 'react';
import type { OnboardingStepStatus } from '../types.ts';
import { api } from '../api.ts';
import { track } from '../analytics.ts';

interface StepEntry {
  status: OnboardingStepStatus;
  retryPayload?: { uuid: string; state: Record<string, unknown> };
  errorStatus?: number;
  consecutiveFailures: number;
}

function makeInitialSteps(count: number): StepEntry[] {
  return Array.from({ length: count }, () => ({ status: 'incomplete' as OnboardingStepStatus, consecutiveFailures: 0 }));
}

export function useOnboarding(count: number, inlineErrorsEnabled: boolean) {
  const [steps, setSteps] = useState<StepEntry[]>(() => makeInitialSteps(count));

  const setStep = useCallback((index: number, update: Partial<StepEntry>) => {
    setSteps((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...update };
      return next;
    });
  }, []);

  const executeStep = useCallback(async (index: number, uuid: string, state: Record<string, unknown>) => {
    setStep(index, { status: 'loading' });

    try {
      await api.saveOnboardingState(uuid, state);
      setStep(index, { status: 'complete', consecutiveFailures: 0 });
    } catch (err: unknown) {
      const errorStatus = (err as { status?: number }).status;
      const retryPayload = { uuid, state };

      if (inlineErrorsEnabled) {
        setSteps((prev) => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            status: 'error',
            retryPayload,
            errorStatus,
            consecutiveFailures: (next[index]?.consecutiveFailures ?? 0) + 1,
          };
          return next;
        });
        track('onboarding_error_displayed', { stepIndex: index, errorStatus });
      } else {
        setSteps((prev) => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            status: 'incomplete',
            retryPayload,
            errorStatus,
            consecutiveFailures: (next[index]?.consecutiveFailures ?? 0) + 1,
          };
          return next;
        });
      }
    }
  }, [inlineErrorsEnabled, setStep]);

  const retryStep = useCallback((index: number) => {
    track('onboarding_retry_clicked', { stepIndex: index });
    const retryPayload = steps[index]?.retryPayload;
    if (retryPayload) {
      executeStep(index, retryPayload.uuid, retryPayload.state);
    }
  }, [steps, executeStep]);

  return { steps, executeStep, retryStep, consecutiveFailures: steps.map((s) => s.consecutiveFailures) };
}
