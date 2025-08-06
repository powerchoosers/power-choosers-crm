import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import ContactsPage from './pages/ContactsPage';
import ContactPage from './pages/ContactPage';
import ListsPage from './pages/ListsPage';
// import your theme and styled-components here

import SearchBar from './components/SearchBar';
import NotificationModal from './components/NotificationModal';
import ProfilePictureMenu from './components/ProfilePictureMenu';
import { useState } from 'react';

function AppShell({ children }) {
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  // Sidebar and top bar layout
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0f1a' }}>
      {/* Sidebar */}
      <nav style={{ width: 70, background: '#181f2e', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20 }}>
        {/* Sidebar nav items */}
        {[
          { icon: '👥', label: 'Contacts', path: '/contacts' },
          { icon: '📋', label: 'Lists', path: '/lists' },
        ].map(item => (
          <a
            key={item.path}
            href={item.path}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              width: 54, height: 54, marginBottom: 18, borderRadius: 12,
              background: location.pathname.startsWith(item.path) ? '#1a237e' : 'transparent',
              color: location.pathname.startsWith(item.path) ? '#fff' : '#b0b0b0',
              border: location.pathname.startsWith(item.path) ? '2px solid #283593' : '2px solid transparent',
              fontWeight: 700, fontSize: 26, textDecoration: 'none', transition: 'background 0.18s',
            }}
            title={item.label}
          >
            <span>{item.icon}</span>
          </a>
        ))}
      </nav>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Top Bar */}
        <header style={{ height: 70, background: '#1a237e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', boxShadow: '0 2px 8px #0008' }}>
          <div style={{ fontWeight: 700, fontSize: 22 }}>CRM Dashboard</div>
          <div style={{ width: 400 }}><SearchBar /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <span title="Notifications" style={{ cursor: 'pointer', fontSize: 28, color: '#fff', marginRight: 8 }} onClick={() => setNotifOpen(true)}>
              514
            </span>
            <ProfilePictureMenu />
          </div>
        </header>
        <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>
        <NotificationModal open={notifOpen} onClose={() => setNotifOpen(false)} />
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppShell>
        <Routes>
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/contacts/:id" element={<ContactPage />} />
          <Route path="/lists" element={<ListsPage />} />
          <Route path="/lists/:listId" element={<ContactsPage />} />
          <Route path="*" element={<ContactsPage />} />
        </Routes>
      </AppShell>
    </Router>
  );
}

export default App;
