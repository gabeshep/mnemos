import React, { useState } from 'react';
import { Layout } from './components/Layout.tsx';
import { SessionsPage } from './pages/SessionsPage.tsx';
import { SessionDetailPage } from './pages/SessionDetailPage.tsx';
import { AssetsPage } from './pages/AssetsPage.tsx';
import { AssetEditorPage } from './pages/AssetEditorPage.tsx';

type View =
  | { name: 'sessions' }
  | { name: 'session-detail'; sessionId: string }
  | { name: 'assets' }
  | { name: 'asset-editor'; assetId: string };

export default function App() {
  const [view, setView] = useState<View>({ name: 'sessions' });

  function handleNavigate(viewName: string) {
    if (viewName === 'sessions') setView({ name: 'sessions' });
    else if (viewName === 'assets') setView({ name: 'assets' });
  }

  return (
    <Layout onNavigate={handleNavigate}>
      {view.name === 'sessions' && (
        <SessionsPage
          onSelectSession={(sessionId) =>
            setView({ name: 'session-detail', sessionId })
          }
        />
      )}
      {view.name === 'session-detail' && (
        <SessionDetailPage
          sessionId={view.sessionId}
          onBack={() => setView({ name: 'sessions' })}
        />
      )}
      {view.name === 'assets' && (
        <AssetsPage
          onSelectAsset={(assetId) => setView({ name: 'asset-editor', assetId })}
        />
      )}
      {view.name === 'asset-editor' && (
        <AssetEditorPage
          assetId={view.assetId}
          onBack={() => setView({ name: 'assets' })}
        />
      )}
    </Layout>
  );
}
