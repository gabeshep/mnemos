import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-3 flex items-center gap-6">
        <span className="font-semibold text-gray-900 tracking-tight">Mnemos</span>
        <a href="/" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
          Sessions
        </a>
      </nav>
      <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
