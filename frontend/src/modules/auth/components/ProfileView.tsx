/**
 * User profile view showing characters and roles
 */

import React from 'react';
import { useAuth } from '../AuthContext.js';
import type { Character } from '../api.js';

const CharacterCard: React.FC<{ character: Character; isPrimary: boolean }> = ({
  character,
  isPrimary,
}) => {
  const getTokenStatusColor = (status: Character['tokenStatus']) => {
    switch (status) {
      case 'valid':
        return '#10b981';
      case 'expiring':
        return '#f59e0b';
      case 'invalid':
        return '#ef4444';
    }
  };

  const getTokenStatusText = (status: Character['tokenStatus']) => {
    switch (status) {
      case 'valid':
        return 'Valid';
      case 'expiring':
        return 'Expiring soon';
      case 'invalid':
        return 'Invalid';
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '16px',
        padding: '16px',
        backgroundColor: 'white',
        border: `2px solid ${isPrimary ? '#0ea5e9' : '#e2e8f0'}`,
        borderRadius: '8px',
        position: 'relative',
      }}
    >
      {isPrimary && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '4px 8px',
            backgroundColor: '#0ea5e9',
            color: 'white',
            fontSize: '12px',
            fontWeight: '500',
            borderRadius: '4px',
          }}
        >
          Primary
        </div>
      )}

      <img
        src={character.portraitUrl}
        alt={character.eveCharacterName}
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '8px',
          border: '2px solid #e2e8f0',
        }}
      />

      <div style={{ flex: 1 }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600', color: '#0f172a' }}>
          {character.eveCharacterName}
        </h3>

        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '2px' }}>
            Corporation: {character.corpName}
          </div>
          {character.allianceName && (
            <div style={{ fontSize: '14px', color: '#64748b' }}>
              Alliance: {character.allianceName}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
          <span style={{ color: '#64748b' }}>Token status:</span>
          <span
            style={{
              color: getTokenStatusColor(character.tokenStatus),
              fontWeight: '500',
            }}
          >
            {getTokenStatusText(character.tokenStatus)}
          </span>
        </div>

        <div style={{ marginTop: '4px', fontSize: '12px', color: '#94a3b8' }}>
          Last verified: {new Date(character.lastVerifiedAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
};

export const ProfileView: React.FC = () => {
  const { user, loading, error } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
        Loading profile...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '24px',
          textAlign: 'center',
          color: '#dc2626',
          backgroundColor: '#fef2f2',
          borderRadius: '8px',
          margin: '24px',
        }}
      >
        Error loading profile: {error.message}
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          color: '#64748b',
        }}
      >
        <p style={{ fontSize: '16px', marginBottom: '16px' }}>You are not logged in</p>
        <a
          href="#home"
          style={{
            display: 'inline-block',
            padding: '8px 16px',
            backgroundColor: '#0ea5e9',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          Go to Home
        </a>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#0f172a', marginBottom: '24px' }}>
        Profile
      </h1>

      <div
        style={{
          backgroundColor: 'white',
          padding: '24px',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          marginBottom: '24px',
        }}
      >
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>
          Account Information
        </h2>

        <div style={{ display: 'grid', gap: '12px' }}>
          <div>
            <span style={{ fontSize: '14px', color: '#64748b', marginRight: '8px' }}>
              Display Name:
            </span>
            <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: '500' }}>
              {user.displayName}
            </span>
          </div>

          {user.email && (
            <div>
              <span style={{ fontSize: '14px', color: '#64748b', marginRight: '8px' }}>Email:</span>
              <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: '500' }}>
                {user.email}
              </span>
            </div>
          )}

          {user.isSuperAdmin && (
            <div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: '600',
                  borderRadius: '9999px',
                }}
              >
                SUPER ADMIN
              </span>
            </div>
          )}
        </div>
      </div>

      {user.featureRoles.length > 0 && (
        <div
          style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            marginBottom: '24px',
          }}
        >
          <h2
            style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}
          >
            Roles
          </h2>

          <div style={{ display: 'grid', gap: '8px' }}>
            {user.featureRoles.map((role, index) => (
              <div key={index} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#64748b' }}>{role.featureKey}</span>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#0f172a',
                    textTransform: 'capitalize',
                  }}
                >
                  {role.roleKey}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>
          Characters ({user.characters.length})
        </h2>

        <div style={{ display: 'grid', gap: '16px' }}>
          {user.characters.map((char) => (
            <CharacterCard
              key={char.id}
              character={char}
              isPrimary={char.id === user.primaryCharacter?.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
