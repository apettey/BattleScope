/**
 * Enhanced user profile view with self-service character management
 */

import { useState, useEffect } from 'react';
import type { FC } from 'react';
import {
  fetchProfile,
  setPrimaryCharacter,
  removeCharacter,
  getRefreshTokenUrl,
  getAddCharacterUrl,
  type ProfileResponse,
  type DetailedCharacter,
} from '../api.js';

// ============================================================================
// Character Card Component
// ============================================================================

interface CharacterCardProps {
  character: DetailedCharacter;
  isOnlyCharacter: boolean;
  onSetPrimary: (characterId: string) => void;
  onRemove: (character: DetailedCharacter) => void;
  onRefreshToken: (characterId: string) => void;
}

const CharacterCard: FC<CharacterCardProps> = ({
  character,
  isOnlyCharacter,
  onSetPrimary,
  onRemove,
  onRefreshToken,
}) => {
  const getTokenStatusColor = (status: DetailedCharacter['tokenStatus']) => {
    switch (status) {
      case 'valid':
        return '#10b981';
      case 'expiring':
        return '#f59e0b';
      case 'expired':
        return '#ef4444';
    }
  };

  const getTokenStatusText = (status: DetailedCharacter['tokenStatus']) => {
    switch (status) {
      case 'valid':
        return 'Token valid';
      case 'expiring':
        return 'Token expiring soon';
      case 'expired':
        return 'Token expired';
    }
  };

  const needsRefresh = character.tokenStatus === 'expired' || character.tokenStatus === 'expiring';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '16px',
        padding: '16px',
        backgroundColor: 'white',
        border: `2px solid ${character.isPrimary ? '#0ea5e9' : '#e2e8f0'}`,
        borderRadius: '8px',
        position: 'relative',
      }}
    >
      {character.isPrimary && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '4px 8px',
            backgroundColor: '#0ea5e9',
            color: 'white',
            fontSize: '12px',
            fontWeight: '600',
            borderRadius: '4px',
          }}
        >
          ⭐ PRIMARY
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
        <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
          {character.eveCharacterName}
        </h3>

        <div style={{ marginBottom: '8px', fontSize: '14px', color: '#64748b' }}>
          <div>
            [{character.corpId}] {character.corpName}
          </div>
          {character.allianceName && (
            <div>
              [{character.allianceId}] {character.allianceName}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '8px' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              fontSize: '12px',
              fontWeight: '500',
              borderRadius: '4px',
              backgroundColor:
                character.tokenStatus === 'valid'
                  ? '#d1fae5'
                  : character.tokenStatus === 'expiring'
                    ? '#fef3c7'
                    : '#fee2e2',
              color: getTokenStatusColor(character.tokenStatus),
            }}
          >
            {getTokenStatusText(character.tokenStatus)}
          </span>
        </div>

        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '12px' }}>
          Last verified: {new Date(character.lastVerifiedAt).toLocaleString()}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {needsRefresh && (
            <button
              type="button"
              onClick={() => onRefreshToken(character.id)}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Refresh Token
            </button>
          )}
          {!character.isPrimary && (
            <button
              type="button"
              onClick={() => onSetPrimary(character.id)}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: '#0ea5e9',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Set as Primary
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(character)}
            disabled={isOnlyCharacter}
            style={{
              padding: '6px 12px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: isOnlyCharacter ? '#94a3b8' : '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isOnlyCharacter ? 'not-allowed' : 'pointer',
              opacity: isOnlyCharacter ? 0.5 : 1,
            }}
            title={isOnlyCharacter ? 'Cannot remove your only character' : undefined}
          >
            Remove Character
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Modal Components
// ============================================================================

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const Modal: FC<ModalProps> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

interface ConfirmRemoveModalProps {
  character: DetailedCharacter | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmRemoveModal: FC<ConfirmRemoveModalProps> = ({ character, onConfirm, onCancel }) => {
  if (!character) return null;

  return (
    <Modal isOpen={!!character} onClose={onCancel}>
      <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '600' }}>
        Remove Character
      </h2>

      <div style={{ marginBottom: '16px', textAlign: 'center' }}>
        <img
          src={character.portraitUrl}
          alt={character.eveCharacterName}
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '8px',
            border: '2px solid #e2e8f0',
            marginBottom: '12px',
          }}
        />
        <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
          {character.eveCharacterName}
        </div>
        <div style={{ fontSize: '14px', color: '#64748b' }}>{character.corpName}</div>
      </div>

      <p style={{ color: '#64748b', marginBottom: '16px' }}>
        Are you sure you want to remove this character from your account? This action cannot be
        undone.
      </p>

      {character.isPrimary && (
        <div
          style={{
            padding: '12px',
            backgroundColor: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '4px',
            marginBottom: '16px',
          }}
        >
          <strong style={{ color: '#92400e' }}>⚠️ Warning:</strong>
          <span style={{ color: '#92400e' }}>
            {' '}
            This is your primary character. Your oldest remaining character will become the new
            primary.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: '500',
            backgroundColor: '#f1f5f9',
            color: '#0f172a',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: '500',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Remove Character
        </button>
      </div>
    </Modal>
  );
};

interface ConfirmSetPrimaryModalProps {
  character: DetailedCharacter | null;
  currentPrimary: DetailedCharacter | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmSetPrimaryModal: FC<ConfirmSetPrimaryModalProps> = ({
  character,
  currentPrimary,
  onConfirm,
  onCancel,
}) => {
  if (!character) return null;

  return (
    <Modal isOpen={!!character} onClose={onCancel}>
      <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '600' }}>
        Change Primary Character
      </h2>

      {currentPrimary && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
            Current Primary:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src={currentPrimary.portraitUrl}
              alt={currentPrimary.eveCharacterName}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '6px',
                border: '2px solid #e2e8f0',
              }}
            />
            <div>{currentPrimary.eveCharacterName}</div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>New Primary:</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src={character.portraitUrl}
            alt={character.eveCharacterName}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '6px',
              border: '2px solid #e2e8f0',
            }}
          />
          <div>{character.eveCharacterName}</div>
        </div>
      </div>

      <p style={{ color: '#64748b', marginBottom: '16px' }}>
        Your primary character is used for authentication. You will remain logged in after this
        change.
      </p>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: '500',
            backgroundColor: '#f1f5f9',
            color: '#0f172a',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: '500',
            backgroundColor: '#0ea5e9',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Change Primary
        </button>
      </div>
    </Modal>
  );
};

// ============================================================================
// Main Profile View
// ============================================================================

export const EnhancedProfileView: FC = () => {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [characterToRemove, setCharacterToRemove] = useState<DetailedCharacter | null>(null);
  const [characterToSetPrimary, setCharacterToSetPrimary] = useState<DetailedCharacter | null>(
    null,
  );

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProfile();
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  const handleSetPrimary = async () => {
    if (!characterToSetPrimary) return;

    try {
      await setPrimaryCharacter(characterToSetPrimary.id);
      setCharacterToSetPrimary(null);
      await loadProfile(); // Reload to get updated data
    } catch (err) {
      alert(
        `Failed to set primary character: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  };

  const handleRemove = async () => {
    if (!characterToRemove) return;

    try {
      await removeCharacter(characterToRemove.id);
      setCharacterToRemove(null);
      await loadProfile(); // Reload to get updated data
    } catch (err) {
      alert(`Failed to remove character: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleRefreshToken = (characterId: string) => {
    window.location.href = getRefreshTokenUrl(characterId);
  };

  const handleAddCharacter = () => {
    window.location.href = getAddCharacterUrl();
  };

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
        <div style={{ marginBottom: '16px' }}>Error loading profile: {error}</div>
        <button
          type="button"
          onClick={() => void loadProfile()}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: '500',
            backgroundColor: '#0ea5e9',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!profile) return null;

  const allCharacters = profile.charactersGrouped.flatMap((alliance) =>
    alliance.corporations.flatMap((corp) => corp.characters),
  );
  const isOnlyCharacter = allCharacters.length === 1;
  const currentPrimary = allCharacters.find((char) => char.isPrimary) || null;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header with Add Character button */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
          My Profile
        </h1>
        <button
          type="button"
          onClick={handleAddCharacter}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            fontWeight: '600',
            backgroundColor: '#0ea5e9',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          + Add Character
        </button>
      </div>

      {/* Account Information */}
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
              {profile.account.displayName}
            </span>
          </div>

          {profile.account.email && (
            <div>
              <span style={{ fontSize: '14px', color: '#64748b', marginRight: '8px' }}>Email:</span>
              <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: '500' }}>
                {profile.account.email}
              </span>
            </div>
          )}

          {profile.account.lastLoginAt && (
            <div>
              <span style={{ fontSize: '14px', color: '#64748b', marginRight: '8px' }}>
                Last Login:
              </span>
              <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: '500' }}>
                {new Date(profile.account.lastLoginAt).toLocaleString()}
              </span>
            </div>
          )}

          {profile.account.isSuperAdmin && (
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

      {/* Statistics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
            Total Characters
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#0f172a' }}>
            {profile.stats.totalCharacters}
          </div>
        </div>
        <div
          style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
            Alliances Represented
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#0f172a' }}>
            {profile.stats.uniqueAlliances}
          </div>
        </div>
        <div
          style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
            Corporations Represented
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#0f172a' }}>
            {profile.stats.uniqueCorporations}
          </div>
        </div>
      </div>

      {/* Feature Roles */}
      {profile.featureRoles.length > 0 && (
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
            Feature Permissions
          </h2>

          <div style={{ display: 'grid', gap: '12px' }}>
            {profile.featureRoles.map((role, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                }}
              >
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
                    {role.featureName}
                  </div>
                  <div style={{ fontSize: '14px', color: '#64748b' }}>
                    Role: {role.roleName} (Rank {role.roleRank})
                  </div>
                </div>
                <span
                  style={{
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    borderRadius: '9999px',
                    backgroundColor:
                      role.roleKey === 'admin'
                        ? '#fee2e2'
                        : role.roleKey === 'director'
                          ? '#ede9fe'
                          : role.roleKey === 'fc'
                            ? '#dbeafe'
                            : '#f1f5f9',
                    color:
                      role.roleKey === 'admin'
                        ? '#991b1b'
                        : role.roleKey === 'director'
                          ? '#5b21b6'
                          : role.roleKey === 'fc'
                            ? '#1e40af'
                            : '#475569',
                  }}
                >
                  {role.roleKey.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Characters Grouped by Alliance/Corporation */}
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>
          My Characters
        </h2>

        {profile.charactersGrouped.map((alliance, allianceIndex) => (
          <div
            key={allianceIndex}
            style={{
              marginBottom: '24px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              padding: '20px',
            }}
          >
            <h3
              style={{
                fontSize: '18px',
                fontWeight: '600',
                color: '#0f172a',
                marginBottom: '16px',
              }}
            >
              {alliance.allianceName ?? 'No Alliance'}
              {alliance.allianceName && (
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: '400',
                    color: '#64748b',
                    marginLeft: '8px',
                  }}
                >
                  [{alliance.allianceId}]
                </span>
              )}
            </h3>

            {alliance.corporations.map((corp, corpIndex) => (
              <div key={corpIndex} style={{ marginBottom: '20px' }}>
                <h4
                  style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#475569',
                    marginBottom: '12px',
                  }}
                >
                  {corp.corpName}
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: '400',
                      color: '#64748b',
                      marginLeft: '8px',
                    }}
                  >
                    [{corp.corpId}]
                  </span>
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: '400',
                      color: '#94a3b8',
                      marginLeft: '8px',
                    }}
                  >
                    ({corp.characters.length}{' '}
                    {corp.characters.length === 1 ? 'character' : 'characters'})
                  </span>
                </h4>

                <div style={{ display: 'grid', gap: '12px' }}>
                  {corp.characters.map((char) => (
                    <CharacterCard
                      key={char.id}
                      character={char}
                      isOnlyCharacter={isOnlyCharacter}
                      onSetPrimary={() => setCharacterToSetPrimary(char)}
                      onRemove={() => setCharacterToRemove(char)}
                      onRefreshToken={handleRefreshToken}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Modals */}
      <ConfirmSetPrimaryModal
        character={characterToSetPrimary}
        currentPrimary={currentPrimary}
        onConfirm={() => void handleSetPrimary()}
        onCancel={() => setCharacterToSetPrimary(null)}
      />
      <ConfirmRemoveModal
        character={characterToRemove}
        onConfirm={() => void handleRemove()}
        onCancel={() => setCharacterToRemove(null)}
      />
    </div>
  );
};
