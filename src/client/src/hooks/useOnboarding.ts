import { useState, useCallback } from 'react';
import type { OnboardingStepStatus } from '../types.ts';
import { api } from '../api.ts';
import { track } from '../analytics.ts';

interface StepEntry {
  status: OnboardingStepStatus;
  retryPayload?: { uuid: string; state: Record<string, unknown> };
  errorStatus?: number;
}

function makeInitialSteps(count: number): StepEntry[] {
  return Array.from({ length: count }, () => ({ status: 'incomplete' as OnboardingStepStatus }));
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
      setStep(index, { status: 'complete' });
    } catch (err: unknown) {
      const errorStatus = (err as { status?: number }).status;
      const retryPayload = { uuid, state };

      if (inlineErrorsEnabled) {
        setStep(index, { status: 'error', retryPayload, errorStatus });
        track('onboarding_error_displayed', { stepIndex: index, errorStatus });
      } else {
        setStep(index, { status: 'incomplete', retryPayload, errorStatus });
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

  return { steps, executeStep, retryStep };
}
