import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import ContactsPage from './ContactsPage';
import ContactPage from './ContactPage';
import ListsPage from './ListsPage';
import SearchBar from './SearchBar';
import NotificationModal from './NotificationModal';
import ProfilePictureMenu from './ProfilePictureMenu';
import './crm-styles.css';

const sidebarItems = [
  { icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 8h14v-2H7v2zm0-4h14v-2H7v2zm0-6v2h14V7H7z"/></svg>, label: 'Dashboard', path: '/' },
  { icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, label: 'Contacts', path: '/contacts' },
  { icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>, label: 'Accounts', path: '/accounts' },
  { icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>, label: 'Lists', path: '/lists' },
  { icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 16.92V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2.08"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M12 17v-5"/></svg>, label: 'Calls', path: '/calls' },
  { icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/></svg>, label: 'Email', path: '/email' },
  { icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>, label: 'Tasks', path: '/tasks' },
  { icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2v20"/></svg>, label: 'Settings', path: '/settings' }
];

function AppShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  return (
    <div className="app-wrapper">
      <header className="app-header">
        <div className="header-left">
          <div className="app-logo">
            <img src="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/68645bd391ea20fecb011c85_2656%20Webclip%20PChoosers.png" alt="Power Choosers Logo" />
          </div>
          <h1 className="app-title">CRM Dashboard</h1>
        </div>
        <div className="header-center">
          <div className="search-bar">
            <SearchBar />
          </div>
        </div>
        <div className="header-right">
          <button className="icon-button" title="Call Scripts">
            {/* SVG for Call Scripts */}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
          </button>
          <button className="icon-button" title="Notifications" onClick={() => setNotifOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
            <span className="notification-badge">514</span>
          </button>
          <ProfilePictureMenu />
        </div>
      </header>
      <div className="sidebar">
        {sidebarItems.map(item => (
          <div key={item.path} className={`sidebar-item${location.pathname === item.path ? ' active' : ''}`} title={item.label} onClick={() => navigate(item.path)}>
            {item.icon}
            <span className="sidebar-label">{item.label}</span>
          </div>
        ))}
      </div>
      <main className="main-content">{children}</main>
      <NotificationModal open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppShell>
        <Routes>
          <Route path="/" element={<ContactsPage />} />
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
