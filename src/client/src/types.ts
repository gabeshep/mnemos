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
  messages?: SessionMessage[];
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
