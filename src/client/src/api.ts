import type { Entity, Asset, AssetVersion, Session, CaptureResult, PublishedAssetVersion, CreateSessionResponse, SendMessageResponse } from './types.ts';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
    (err as Error & { status: number }).status = res.status;
    throw err;
  }

  return res.json() as Promise<T>;
}

export const api = {
  getEntities: (): Promise<Entity[]> =>
    request('/api/entities'),

  getAssets: (entityId: string): Promise<Asset[]> =>
    request(`/api/entities/${entityId}/assets`),

  getAssetVersions: (assetId: string): Promise<AssetVersion[]> =>
    request(`/api/assets/${assetId}/versions`),

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
};
