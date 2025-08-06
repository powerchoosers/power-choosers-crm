import React from 'react';

const NotificationModal = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(10,15,26,0.88)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#181f2e', borderRadius: 16, padding: 32, minWidth: 350, color: '#fff', boxShadow: '0 4px 32px #000a', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', right: 18, top: 18, background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>×</button>
        <h2 style={{ marginTop: 0, marginBottom: 18 }}>Notifications</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li style={{ marginBottom: 12 }}>🔔 You have a new task assigned.</li>
          <li style={{ marginBottom: 12 }}>🔔 Contact Jane Doe was updated.</li>
          <li style={{ marginBottom: 12 }}>🔔 Your note was saved.</li>
        </ul>
      </div>
    </div>
  );
};
export default NotificationModal;
