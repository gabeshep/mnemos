import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Layout } from './components/Layout.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { SessionsPage } from './pages/SessionsPage.tsx';
import { SessionDetailPage } from './pages/SessionDetailPage.tsx';
import { AssetsPage } from './pages/AssetsPage.tsx';
import { AssetEditorPage } from './pages/AssetEditorPage.tsx';

type View =
  | { name: 'sessions' }
  | { name: 'session-detail'; sessionId: string }
  | { name: 'assets' }
  | { name: 'asset-editor'; assetId: string };

function AppShell() {
  const { user, isLoading, logout } = useAuth();
  const [view, setView] = useState<View>({ name: 'sessions' });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  function handleNavigate(viewName: string) {
    if (viewName === 'sessions') setView({ name: 'sessions' });
    else if (viewName === 'assets') setView({ name: 'assets' });
  }

  return (
    <Layout onNavigate={handleNavigate} onLogout={logout}>
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

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
