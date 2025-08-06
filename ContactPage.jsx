import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import EnergyHealthCheck from '../widgets/EnergyHealthCheck';
import NotesWidget from '../widgets/NotesWidget';

const FIELDS = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'title', label: 'Title' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'notes', label: 'Notes' },
  { key: 'createdAt', label: 'Created' },
  { key: 'updatedAt', label: 'Updated' },
];

const FieldRow = ({ label, value, onEdit, onCopy, onDelete, isEditing, onChange, onSave, onCancel }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{ width: 140, color: '#b0b0b0', fontWeight: 500 }}>{label}:</div>
      {isEditing ? (
        <>
          <input value={value} onChange={e => onChange(e.target.value)} style={{ flex: 1, padding: 6, borderRadius: 6, border: 'none', background: '#232a3a', color: '#fff' }} />
          <button onClick={onSave} style={{ marginLeft: 8, background: '#1a237e', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px' }}>Save</button>
          <button onClick={onCancel} style={{ marginLeft: 4, background: '#232a3a', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px' }}>Cancel</button>
        </>
      ) : (
        <>
          <div style={{ flex: 1, color: '#fff', wordBreak: 'break-all' }}>{value}</div>
          {hovered && (
            <div style={{ display: 'flex', gap: 10, marginLeft: 10 }}>
              <span title="Edit" style={{ cursor: 'pointer', color: '#2196f3' }} onClick={onEdit}>✏️</span>
              <span title="Copy" style={{ cursor: 'pointer', color: '#2196f3' }} onClick={() => { navigator.clipboard.writeText(value); }}>📋</span>
              <span title="Delete" style={{ cursor: 'pointer', color: '#f44336' }} onClick={onDelete}>🗑️</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const ContactPage = () => {
  const { id } = useParams();
  const [contact, setContact] = useState(null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState({});
  const [editValues, setEditValues] = useState({});

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // Load contact
        const docRef = doc(db, 'contacts', id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) throw new Error('Contact not found');
        const contactData = docSnap.data();
        setContact({ id, ...contactData });
        // Load associated account
        if (contactData.accountId) {
          const accRef = doc(db, 'accounts', contactData.accountId);
          const accSnap = await getDoc(accRef);
          setAccount(accSnap.exists() ? { id: accSnap.id, ...accSnap.data() } : null);
        } else {
          setAccount(null);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  const handleEdit = key => {
    setEditing({ ...editing, [key]: true });
    setEditValues({ ...editValues, [key]: contact[key] });
  };
  const handleSave = async key => {
    setEditing({ ...editing, [key]: false });
    try {
      setLoading(true);
      const docRef = doc(db, 'contacts', contact.id);
      await updateDoc(docRef, { [key]: editValues[key], updatedAt: new Date() });
      setContact(prev => ({ ...prev, [key]: editValues[key], updatedAt: { seconds: Math.floor(Date.now() / 1000) } }));
    } catch (e) {
      setError('Failed to save change: ' + e.message);
    } finally {
      setLoading(false);
    }
  };
  const handleCancel = key => {
    setEditing({ ...editing, [key]: false });
  };
  const handleDelete = key => {
    if (window.confirm('Delete this field?')) {
      setContact({ ...contact, [key]: '' });
    }
  };

  if (loading) return <div style={{ color: '#fff', padding: 32 }}>Loading contact...</div>;
  if (error) return <div style={{ color: 'red', padding: 32 }}>{error}</div>;
  if (!contact) return <div style={{ color: '#fff', padding: 32 }}>Contact not found.</div>;

  return (
    <div style={{ display: 'flex', height: '100%', background: '#0a0f1a' }}>
      {/* Main Content */}
      <div style={{ flex: 1, padding: '40px 48px', color: '#fff' }}>
        {/* Company Info Widget */}
        <div style={{ background: '#181f2e', borderRadius: 12, padding: 24, marginBottom: 32, display: 'flex', alignItems: 'center', boxShadow: '0 2px 12px #0006' }}>
          <img src={account && account.website ? `https://www.google.com/s2/favicons?domain=${account.website.replace(/^https?:\/\//, '')}` : ''} alt="favicon" style={{ width: 48, height: 48, borderRadius: 10, marginRight: 24 }} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{account?.name || contact.accountName || 'No Company'}</div>
            <div style={{ color: '#b0b0b0', marginBottom: 4 }}>{account?.website || ''}</div>
            <div style={{ color: '#b0b0b0' }}>{account?.industry || ''} {account?.phone ? `· ${account.phone}` : ''} {account?.address ? `· ${account.address}` : ''}</div>
            <div style={{ color: '#b0b0b0', marginTop: 8 }}>{account?.painPoints ? `Pain Points: ${account.painPoints}` : ''}</div>
            <div style={{ color: '#b0b0b0' }}>{account?.benefits ? `Benefits: ${account.benefits}` : ''}</div>
            <div style={{ color: '#b0b0b0', fontSize: 12, marginTop: 4 }}>
              {account?.createdAt ? `Created: ${new Date(account.createdAt.seconds * 1000).toLocaleDateString()}` : ''}
              {account?.updatedAt ? ` · Updated: ${new Date(account.updatedAt.seconds * 1000).toLocaleDateString()}` : ''}
            </div>
          </div>
        </div>
        {/* Contact Fields */}
        <div style={{ background: '#1a1a1a', borderRadius: 12, padding: 24, marginBottom: 32, boxShadow: '0 2px 12px #0006' }}>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 18 }}>Contact Info</div>
          {FIELDS.map(({ key, label }) => (
            <FieldRow
              key={key}
              label={label}
              value={key === 'createdAt' || key === 'updatedAt' ? (contact[key] ? new Date(contact[key].seconds * 1000).toLocaleDateString() : '') : contact[key]}
              isEditing={!!editing[key]}
              onEdit={() => handleEdit(key)}
              onCopy={() => navigator.clipboard.writeText(contact[key])}
              onDelete={() => handleDelete(key)}
              onChange={val => setEditValues({ ...editValues, [key]: val })}
              onSave={() => handleSave(key)}
              onCancel={() => handleCancel(key)}
            />
          ))}
        </div>
      </div>
      {/* Right-hand Widget Scroll Section */}
      <div style={{ width: 400, minWidth: 320, maxWidth: 500, overflowY: 'auto', height: '100vh', marginTop: 0, marginRight: 0, padding: 32, background: '#181f2e', position: 'relative', zIndex: 900, boxShadow: '-2px 0 10px rgba(0,0,0,0.2)' }}>
        <EnergyHealthCheck />
        <NotesWidget />
        {/* Add more widgets here */}
      </div>
    </div>
  );
};

export default ContactPage;
