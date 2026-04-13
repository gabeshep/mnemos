import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api.ts';
import { track } from '../analytics.ts';
import type { VocReportPayload } from '../types.ts';

interface SupportFallbackProps {
  stepIndex: number;
  errorCode?: number;
  tenantId?: string;
  docsUrl?: string;
}

type Status = 'idle' | 'submitting' | 'submitted' | 'offline_cached' | 'error';

interface FormState {
  description: string;
  status: Status;
  errorMessage?: string;
}

export function SupportFallback({ stepIndex, errorCode, tenantId, docsUrl = '/docs/troubleshooting-onboarding' }: SupportFallbackProps) {
  const [formState, setFormState] = useState<FormState>({ description: '', status: 'idle' });

  const storageKey = `mnemos-voc-pending-${tenantId ?? 'anon'}`;

  const handleOnlineRetry = useCallback(() => {
    let payload: VocReportPayload | null = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        payload = JSON.parse(raw) as VocReportPayload;
      }
    } catch {
      // ignore parse errors
    }
    if (payload) {
      api.submitVocReport(payload)
        .then(() => {
          try {
            localStorage.removeItem(storageKey);
          } catch {
            // ignore
          }
          setFormState((prev) => ({ ...prev, status: 'submitted' }));
        })
        .catch(() => {
          // keep offline_cached on failure
        });
    }
  }, [storageKey]);

  useEffect(() => {
    track('support_fallback_rendered', { stepIndex });
    window.addEventListener('online', handleOnlineRetry);
    return () => {
      window.removeEventListener('online', handleOnlineRetry);
    };
  }, [stepIndex, handleOnlineRetry]);

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setFormState((prev) => ({ ...prev, description: value }));
    try {
      localStorage.setItem(storageKey, JSON.stringify({ stepIndex, errorCode, description: value }));
    } catch {
      // ignore storage errors
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { description } = formState;

    if (!navigator.onLine) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ stepIndex, errorCode, description }));
      } catch {
        // ignore storage errors
      }
      setFormState((prev) => ({ ...prev, status: 'offline_cached' }));
      track('voc_report_saved_offline', { stepIndex });
      return;
    }

    setFormState((prev) => ({ ...prev, status: 'submitting' }));

    try {
      await api.submitVocReport({ stepIndex, errorCode, description });
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
      setFormState((prev) => ({ ...prev, status: 'submitted' }));
      track('voc_report_submitted', { stepIndex });
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        setFormState((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: 'Session expired — please refresh and try again',
        }));
      } else {
        setFormState((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: 'Something went wrong. Please try again.',
        }));
      }
    }
  };

  if (formState.status === 'submitted') {
    return (
      <div className="mt-6 border border-amber-200 bg-amber-50 rounded-lg p-4">
        <p className="text-sm text-amber-800">Report sent — thank you</p>
      </div>
    );
  }

  return (
    <div className="mt-6 border border-amber-200 bg-amber-50 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-amber-900 mb-1">Stuck? Get Help</h3>
      <p className="text-sm text-amber-700 mb-3">
        Check the{' '}
        <a href={docsUrl} className="underline text-amber-800 hover:text-amber-900">
          troubleshooting docs
        </a>{' '}
        or describe your issue below and we'll follow up.
      </p>
      {formState.status === 'offline_cached' && (
        <p className="text-sm text-amber-700 mb-3">Saved offline — will send when connection restores.</p>
      )}
      {formState.status === 'error' && formState.errorMessage && (
        <p className="text-sm text-red-600 mb-3">{formState.errorMessage}</p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          className="w-full rounded border border-amber-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          rows={4}
          maxLength={2000}
          placeholder="Describe what's happening..."
          value={formState.description}
          onChange={handleDescriptionChange}
          disabled={formState.status === 'submitting'}
        />
        <button
          type="submit"
          disabled={formState.status === 'submitting' || formState.description.trim().length === 0}
          className="self-start rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {formState.status === 'submitting' ? 'Sending…' : 'Report Issue'}
        </button>
      </form>
    </div>
  );
}

export default SupportFallback;
