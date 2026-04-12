import React, { useState } from 'react';
import { Layout } from './components/Layout.tsx';
import { SessionsPage } from './pages/SessionsPage.tsx';
import { SessionDetailPage } from './pages/SessionDetailPage.tsx';

type View =
  | { name: 'sessions' }
  | { name: 'session-detail'; sessionId: string };

export default function App() {
  const [view, setView] = useState<View>({ name: 'sessions' });

  return (
    <Layout>
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
    </Layout>
  );
}
