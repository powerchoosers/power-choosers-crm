import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { db } from '../firebase';
// import { collection, getDocs, query, where } from 'firebase/firestore';
// For now, we'll mock the data and logic

const MOCK_CONTACTS = [
  { name: 'John Doe', email: 'john@acme.com', company: 'Acme', workNumber: '123-456-7890', mobileNumber: '555-555-5555', linkedin: 'johndoe', title: 'Manager' },
  { name: 'Jane Smith', email: 'jane@globex.com', company: 'Globex', workNumber: '987-654-3210', mobileNumber: '444-444-4444', linkedin: 'janesmith', title: 'Director' },
  // ... more mock data
];

function getSuggestions(query, contacts, context) {
  if (!query) return [];
  const q = query.toLowerCase();
  if (context === 'contacts') {
    return contacts.filter(c => c.name.toLowerCase().includes(q));
  }
  // Global search: match any field
  return contacts.filter(c =>
    Object.values(c).some(val => val && val.toLowerCase().includes(q))
  );
}

const SearchBar = () => {
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const context = location.pathname.startsWith('/contacts') ? 'contacts' : 'global';

  useEffect(() => {
    // In production, fetch from Firebase
    const results = getSuggestions(query, MOCK_CONTACTS, context);
    setSuggestions(results);
  }, [query, context]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={context === 'contacts' ? 'Search contacts...' : 'Search CRM...'}
        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: 'none', background: '#222', color: '#fff' }}
      />
      {query && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: '#181f2e', color: '#fff', borderRadius: '0 0 8px 8px', boxShadow: '0 2px 8px #0008', zIndex: 10 }}>
          {suggestions.map((s, i) => (
            <div key={i} style={{ padding: '10px', borderBottom: '1px solid #222', cursor: 'pointer' }}>
              {context === 'contacts' ? s.name : Object.values(s).join(' · ')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
