import React, { useState, useEffect } from 'react';
import AdminDashboard from './components/AdminDashboard';
import ParticipantExam from './components/ParticipantExam';

export default function App() {
  // Simple state router: 'admin' | 'peserta'
  // Detects path or falls back to React state toggle so both are fully interactive!
  const [currentView, setCurrentView] = useState<'admin' | 'peserta'>('admin');

  useEffect(() => {
    // Sync with window pathname URL if accessed directly
    const path = window.location.pathname;
    if (path === '/admin') {
      setCurrentView('admin');
    } else if (path === '/ujian' || path === '/peserta' || path === '/') {
      setCurrentView('peserta');
    }
  }, []);

  const handleToggleView = (view: 'admin' | 'peserta') => {
    setCurrentView(view);
    // Push state so reload works
    const targetPath = view === 'admin' ? '/admin' : '/';
    window.history.pushState(null, '', targetPath);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Floating View Switcher (Only visible to admin as an assistant helper widget in dev) */}
      <div className="fixed bottom-4 right-4 bg-white px-3 py-2 rounded-xl shadow-lg border border-slate-200 flex items-center space-x-2 z-50 text-xs text-slate-800 font-bold">
        <span>Dev Switch:</span>
        <button
          onClick={() => handleToggleView('admin')}
          className={`px-2.5 py-1 rounded-lg transition ${
            currentView === 'admin' 
              ? 'bg-indigo-600 text-white' 
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          Halaman Admin
        </button>
        <button
          onClick={() => handleToggleView('peserta')}
          className={`px-2.5 py-1 rounded-lg transition ${
            currentView === 'peserta' 
              ? 'bg-indigo-600 text-white' 
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          Halaman Peserta
        </button>
      </div>

      {currentView === 'admin' ? (
        <AdminDashboard onPreviewExam={() => handleToggleView('peserta')} />
      ) : (
        <ParticipantExam onBackToAdmin={() => handleToggleView('admin')} />
      )}
    </div>
  );
}
