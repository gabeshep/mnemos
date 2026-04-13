export interface Entity {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface Asset {
  id: string;
  name: string;
  assetType: string;
  createdAt: string;
}

export interface AssetVersion {
  id: string;
  assetId: string;
  versionNumber: number;
  content: string;
  state: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
  createdAt: string;
  notes: string | null;
  sourceSessionId: string | null;
}

export interface AssetDetail extends Asset {
  latestVersion: {
    id: string;
    versionNumber: number;
    state: 'draft' | 'published' | 'archived';
    createdAt: string;
  } | null;
}

export interface CreateAssetResponse {
  asset: Asset;
  assetVersion: AssetVersion;
}

export interface VersionSummary {
  id: string;
  assetId: string;
  versionNumber: number;
  state: 'draft' | 'published' | 'archived';
  createdAt: string;
  notes: string | null;
  sourceSessionId: string | null;
}

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface Session {
  id: string;
  entityId: string;
  title: string | null;
  status: 'active' | 'closed';
  createdAt: string;
  seedAssetVersions: string[];
  excludedAssetVersions: string[];
  contextTokenCount: number | null;
  messages?: SessionMessage[];
}

export interface PublishedAssetVersion {
  id: string;
  assetId: string;
  assetName: string;
  assetType: string;
  estimatedTokens: number;
  publishedAt: string;
}

export type ThresholdExceededResponse = {
  status: 'threshold_exceeded';
  breakdown: PublishedAssetVersion[];
  totalTokens: number;
  maxTokens: number;
};

export type CreateSessionResponse = { status: 'created'; session: Session } | ThresholdExceededResponse;

export interface SendMessageResponse {
  userMessage: SessionMessage;
  assistantMessage: SessionMessage;
}

export interface MessageSnippet {
  messageId: string;
  role: 'user' | 'assistant';
  snippet: string;
  createdAt: string;
}

export interface SessionSearchResult {
  sessionId: string;
  title: string | null;
  entityId: string;
  status: 'active' | 'closed';
  createdAt: string;
  matchingMessages: MessageSnippet[];
}

export interface ApiError extends Error {
  status: number;
  code?: string;
  retryable?: boolean;
  retryAfter?: number | null;
}

export type OnboardingStepStatus = 'incomplete' | 'loading' | 'complete' | 'error';

export interface FeatureFlags {
  onboarding_inline_errors: boolean;
  onboarding_support_fallback: boolean;
}

export interface VocReportPayload {
  stepIndex: number;
  errorCode?: number;
  description: string;
}

export interface CaptureResult {
  capture: {
    id: string;
    sessionId: string;
    tenantId: string;
    targetAssetId: string;
    producedVersionId: string;
    createdAt: string;
    createdBy: string;
  };
  assetVersion: AssetVersion;
}
