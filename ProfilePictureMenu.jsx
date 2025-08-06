import React, { useRef, useState } from 'react';

const ProfilePictureMenu = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profilePic, setProfilePic] = useState(null);
  const fileInput = useRef();

  const handleUpload = e => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => setProfilePic(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <img
        src={profilePic || 'https://ui-avatars.com/api/?name=User&background=1a237e&color=fff'}
        alt="Profile"
        style={{ width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', border: '2px solid #fff', objectFit: 'cover' }}
        onClick={() => setMenuOpen(o => !o)}
      />
      {menuOpen && (
        <div style={{ position: 'absolute', right: 0, top: 50, background: '#181f2e', borderRadius: 12, boxShadow: '0 2px 12px #0009', color: '#fff', minWidth: 180, zIndex: 1200 }}>
          <div style={{ padding: 16, borderBottom: '1px solid #232a3a' }}>
            <input
              type="file"
              accept="image/*"
              ref={fileInput}
              style={{ display: 'none' }}
              onChange={handleUpload}
            />
            <button onClick={() => fileInput.current.click()} style={{ background: 'none', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left' }}>Upload Picture</button>
          </div>
          <div style={{ padding: 16 }}>
            <button onClick={() => { setProfilePic(null); setMenuOpen(false); }} style={{ background: 'none', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left' }}>Reset to Default</button>
          </div>
        </div>
      )}
    </div>
  );
};
export default ProfilePictureMenu;
