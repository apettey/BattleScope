/**
 * User menu component displaying logged-in user with dropdown
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../AuthContext.js';
import { getLoginUrl } from '../api.js';

export const UserMenu: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleLogout = async () => {
    await logout();
    setIsOpen(false);
    // Redirect to home after logout
    window.location.hash = '#home';
  };

  const handleLogin = () => {
    // Redirect to EVE SSO login
    window.location.href = getLoginUrl(window.location.href);
  };

  if (loading) {
    return (
      <div style={{ padding: '8px 16px', color: '#64748b', fontSize: '14px' }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <button
        onClick={handleLogin}
        style={{
          padding: '8px 16px',
          backgroundColor: '#0ea5e9',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0284c7')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0ea5e9')}
      >
        Login with EVE Online
      </button>
    );
  }

  const primaryChar = user.primaryCharacter;
  const isAdmin = user.isSuperAdmin || user.featureRoles.some((r) => r.roleKey === 'admin');

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          backgroundColor: isOpen ? '#f1f5f9' : 'transparent',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          if (!isOpen) e.currentTarget.style.backgroundColor = '#f8fafc';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {primaryChar && (
          <img
            src={primaryChar.portraitUrl}
            alt={primaryChar.eveCharacterName}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '2px solid #e2e8f0',
            }}
          />
        )}
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: '14px', fontWeight: '500', color: '#0f172a' }}>
            {user.displayName}
          </div>
          {primaryChar && (
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              {primaryChar.eveCharacterName}
            </div>
          )}
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="#64748b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '4px',
            backgroundColor: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            minWidth: '200px',
            zIndex: 1000,
          }}
        >
          <div style={{ padding: '8px' }}>
            <a
              href="#profile"
              onClick={() => setIsOpen(false)}
              style={{
                display: 'block',
                padding: '8px 12px',
                fontSize: '14px',
                color: '#0f172a',
                textDecoration: 'none',
                borderRadius: '4px',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              Profile
            </a>
            {isAdmin && (
              <a
                href="#admin"
                onClick={() => setIsOpen(false)}
                style={{
                  display: 'block',
                  padding: '8px 12px',
                  fontSize: '14px',
                  color: '#0f172a',
                  textDecoration: 'none',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Admin
              </a>
            )}
          </div>
          <div style={{ borderTop: '1px solid #e2e8f0', padding: '8px' }}>
            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                color: '#dc2626',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '4px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fef2f2')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
