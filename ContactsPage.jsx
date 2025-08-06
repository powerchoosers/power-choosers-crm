import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from './firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const PAGE_SIZE = 50;

const ContactsPage = () => {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, 'contacts'),
      (snapshot) => {
        setContacts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (err) => {
        setError('Failed to load contacts');
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Filter contacts by all fields
  const filtered = contacts.filter(contact =>
    Object.values(contact).some(val =>
      typeof val === 'string' && val.toLowerCase().includes(filter.toLowerCase())
    )
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageContacts = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) return <div style={{ color: '#fff', padding: 32 }}>Loading contacts...</div>;
  if (error) return <div style={{ color: 'red', padding: 32 }}>{error}</div>;

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ color: '#fff', marginBottom: 24 }}>Contacts</h1>
      <input
        value={filter}
        onChange={e => { setFilter(e.target.value); setPage(1); }}
        placeholder="Filter contacts..."
        style={{ width: 320, padding: 10, borderRadius: 8, border: 'none', background: '#181f2e', color: '#fff', marginBottom: 24 }}
      />
      <table style={{ width: '100%', background: '#1a1a1a', color: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px #0006' }}>
        <thead style={{ background: '#181f2e' }}>
          <tr>
            <th style={{ padding: 12 }}>First Name</th>
            <th style={{ padding: 12 }}>Last Name</th>
            <th style={{ padding: 12 }}>Title</th>
            <th style={{ padding: 12 }}>Company</th>
            <th style={{ padding: 12 }}>Email</th>
            <th style={{ padding: 12 }}>Phone</th>
            <th style={{ padding: 12 }}>Notes</th>
            <th style={{ padding: 12 }}>Created</th>
            <th style={{ padding: 12 }}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {pageContacts.map((contact, i) => (
            <tr
              key={contact.id}
              style={{ background: i % 2 === 0 ? '#232a3a' : '#1a1a1a', cursor: 'pointer' }}
              onClick={() => navigate(`/contacts/${contact.id}`)}
            >
              <td style={{ padding: 12 }}>{contact.firstName}</td>
              <td style={{ padding: 12 }}>{contact.lastName}</td>
              <td style={{ padding: 12 }}>{contact.title}</td>
              <td style={{ padding: 12 }}>{contact.accountName}</td>
              <td style={{ padding: 12 }}>{contact.email}</td>
              <td style={{ padding: 12 }}>{contact.phone}</td>
              <td style={{ padding: 12 }}>{contact.notes}</td>
              <td style={{ padding: 12 }}>{contact.createdAt ? new Date(contact.createdAt.seconds * 1000).toLocaleDateString() : ''}</td>
              <td style={{ padding: 12 }}>{contact.updatedAt ? new Date(contact.updatedAt.seconds * 1000).toLocaleDateString() : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 24 }}>
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ background: '#1a237e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', marginRight: 8, cursor: page === 1 ? 'not-allowed' : 'pointer' }}>Prev</button>
        <span style={{ color: '#fff', margin: '0 12px' }}>{page} / {totalPages}</span>
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ background: '#1a237e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', marginLeft: 8, cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>Next</button>
      </div>
    </div>
  );
};

export default ContactsPage;
