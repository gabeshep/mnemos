import type { Entity, Asset, AssetVersion, AssetDetail, CreateAssetResponse, VersionSummary, Session, CaptureResult, PublishedAssetVersion, CreateSessionResponse, SendMessageResponse, ApiError, FeatureFlags, VocReportPayload, SessionSearchResult } from './types.ts';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; code?: string; retryable?: boolean; retryAfter?: number | null };
    const err = new Error(body.error ?? `Request failed: ${res.status}`) as ApiError;
    err.status = res.status;
    err.code = body.code;
    err.retryable = body.retryable;
    err.retryAfter = body.retryAfter;
    throw err;
  }

  return res.json() as Promise<T>;
}

export const api = {
  getEntities: (): Promise<Entity[]> =>
    request('/api/entities'),

  getAssets: (entityId: string): Promise<AssetDetail[]> =>
    request(`/api/entities/${entityId}/assets`),

  getAssetVersions: (assetId: string): Promise<AssetVersion[]> =>
    request(`/api/assets/${assetId}/versions`),

  createAsset: (body: { entityId: string; name: string; assetType: string; description?: string }): Promise<CreateAssetResponse> =>
    request('/api/assets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getAsset: (assetId: string): Promise<AssetDetail> =>
    request(`/api/assets/${assetId}`),

  getAllAssetVersions: (assetId: string): Promise<VersionSummary[]> =>
    request(`/api/assets/${assetId}/all-versions`),

  getAssetVersion: (assetId: string, versionId: string): Promise<AssetVersion> =>
    request(`/api/assets/${assetId}/versions/${versionId}`),

  saveAssetVersion: (assetId: string, body: { content: string; notes?: string }): Promise<AssetVersion> =>
    request(`/api/assets/${assetId}/versions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  publishAssetVersion: (assetId: string, versionId: string): Promise<{ published: AssetVersion; archived: AssetVersion | null }> =>
    request(`/api/assets/${assetId}/versions/${versionId}/publish`, {
      method: 'POST',
    }),

  demoteAssetVersion: (assetId: string, versionId: string): Promise<AssetVersion> =>
    request(`/api/assets/${assetId}/versions/${versionId}/demote`, {
      method: 'POST',
    }),

  getSessions: (): Promise<Session[]> =>
    request('/api/sessions'),

  getSession: (sessionId: string): Promise<Session> =>
    request(`/api/sessions/${sessionId}`),

  createCapture: (body: {
    sessionId: string;
    targetAssetId: string;
    content: string;
    notes?: string;
  }): Promise<CaptureResult> =>
    request('/api/captures', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getPublishedVersions: (entityId: string): Promise<PublishedAssetVersion[]> =>
    request(`/api/entities/${entityId}/published-versions`),

  createSession: (body: {
    entityId: string;
    assetVersionIds: string[];
    title?: string;
    priority?: string[];
  }): Promise<CreateSessionResponse> =>
    request('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  sendMessage: (sessionId: string, content: string): Promise<SendMessageResponse> =>
    request(`/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  updateSessionTitle: (sessionId: string, title: string): Promise<Session> =>
    request(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),

  saveOnboardingState: (uuid: string, state: Record<string, unknown>): Promise<{ id: string }> =>
    request(`/api/onboarding/state/${uuid}`, {
      method: 'PUT',
      body: JSON.stringify({ state }),
    }),

  getFlags: (): Promise<FeatureFlags> =>
    request('/api/flags'),

  submitVocReport: (payload: VocReportPayload): Promise<{ ok: boolean }> =>
    request('/api/voc/report', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  searchSessions: (q: string, entityId?: string): Promise<SessionSearchResult[]> => {
    const params = new URLSearchParams({ q });
    if (entityId) params.set('entityId', entityId);
    return request(`/api/sessions/search?${params}`);
  },
};
