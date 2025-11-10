/**
 * Admin Panel for SuperAdmin user management
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext.js';
import {
  fetchAccounts,
  fetchAccountDetailWithCharacters,
  blockAccount,
  unblockAccount,
  promoteToSuperAdmin,
  demoteFromSuperAdmin,
  deleteAccount,
  type Account,
  type AccountDetailWithCharacters,
  type DetailedCharacter,
} from '../api.js';
import { useApiCall } from '../../api/useApiCall.js';

// =================================================================
// COMPONENTS
// =================================================================

/**
 * Account list item component
 */
const AccountListItem: React.FC<{
  account: Account;
  onSelect: () => void;
}> = ({ account, onSelect }) => (
  <button
    onClick={onSelect}
    style={{
      width: '100%',
      padding: '12px',
      backgroundColor: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '6px',
      textAlign: 'left',
      cursor: 'pointer',
      transition: 'background-color 0.2s, border-color 0.2s',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = '#f8fafc';
      e.currentTarget.style.borderColor = '#0ea5e9';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = 'white';
      e.currentTarget.style.borderColor = '#e2e8f0';
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
      <span style={{ fontSize: '14px', fontWeight: '500', color: '#0f172a' }}>
        {account.displayName}
      </span>
      <div style={{ display: 'flex', gap: '4px' }}>
        {account.isBlocked && (
          <span
            style={{
              padding: '2px 8px',
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              fontSize: '12px',
              fontWeight: '500',
              borderRadius: '4px',
            }}
          >
            Blocked
          </span>
        )}
        {account.isSuperAdmin && (
          <span
            style={{
              padding: '2px 8px',
              backgroundColor: '#fef3c7',
              color: '#f59e0b',
              fontSize: '12px',
              fontWeight: '500',
              borderRadius: '4px',
            }}
          >
            SuperAdmin
          </span>
        )}
      </div>
    </div>
    <div style={{ fontSize: '12px', color: '#64748b' }}>
      {account.email ?? 'No email'}
      {account.lastLoginAt &&
        ` • Last login: ${new Date(account.lastLoginAt).toLocaleDateString()}`}
    </div>
  </button>
);

/**
 * Character card component showing EVE character details
 */
const CharacterCard: React.FC<{ character: DetailedCharacter }> = ({ character }) => {
  const tokenColor =
    character.tokenStatus === 'valid'
      ? '#10b981'
      : character.tokenStatus === 'expiring'
        ? '#f59e0b'
        : '#dc2626';
  const tokenText =
    character.tokenStatus === 'valid'
      ? 'Valid'
      : character.tokenStatus === 'expiring'
        ? 'Expiring Soon'
        : 'Expired';

  const expiryDate = new Date(character.tokenExpiresAt);
  const now = new Date();
  const daysUntilExpiry = Math.floor(
    (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  const expiryText =
    daysUntilExpiry > 0
      ? `Expires in ${daysUntilExpiry} days`
      : `Expired ${Math.abs(daysUntilExpiry)} days ago`;

  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        padding: '12px',
        backgroundColor: character.isPrimary ? '#fefce8' : 'white',
        border: character.isPrimary ? '2px solid #facc15' : '1px solid #e2e8f0',
        borderRadius: '8px',
      }}
    >
      <img
        src={character.portraitUrl}
        alt={character.eveCharacterName}
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '6px',
          objectFit: 'cover',
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>
            {character.eveCharacterName}
          </span>
          {character.isPrimary && (
            <span
              style={{
                padding: '2px 6px',
                backgroundColor: '#facc15',
                color: '#854d0e',
                fontSize: '11px',
                fontWeight: '600',
                borderRadius: '4px',
              }}
            >
              PRIMARY
            </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
          {character.corpName}
          {character.allianceName && ` • ${character.allianceName}`}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              backgroundColor: tokenColor + '20',
              color: tokenColor,
              borderRadius: '4px',
              fontWeight: '500',
            }}
          >
            {tokenText}
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>{expiryText}</span>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            {character.scopes.length} scopes
          </span>
        </div>
      </div>
    </div>
  );
};

/**
 * View User Page - Full account detail with characters grouped by alliance/corporation
 */
const ViewUserPage: React.FC<{
  accountId: string;
  onClose: () => void;
  onUpdate: () => void;
}> = ({ accountId, onClose, onUpdate }) => {
  const { user: currentUser } = useAuth();
  const { wrapApiCall } = useApiCall();
  const [detail, setDetail] = useState<AccountDetailWithCharacters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        const data = await wrapApiCall(() =>
          fetchAccountDetailWithCharacters(accountId, { signal: abortController.signal }),
        );
        setDetail(data);
      } catch (err) {
        if (!abortController.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        setLoading(false);
      }
    };

    void load();

    return () => abortController.abort();
  }, [accountId, wrapApiCall]);

  const handleBlock = async () => {
    if (!detail || !confirm(`Block user ${detail.account.displayName}?`)) return;

    setActionLoading(true);
    try {
      await wrapApiCall(() => blockAccount(accountId));
      alert(`User ${detail.account.displayName} has been blocked.`);
      onUpdate();
    } catch (err) {
      alert(`Failed to block: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnblock = async () => {
    if (!detail) return;

    setActionLoading(true);
    try {
      await wrapApiCall(() => unblockAccount(accountId));
      alert(`User ${detail.account.displayName} has been unblocked.`);
      onUpdate();
    } catch (err) {
      alert(`Failed to unblock: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePromoteToSuperAdmin = async () => {
    if (
      !detail ||
      !confirm(
        `Promote ${detail.account.displayName} to SuperAdmin?\n\nThis grants unrestricted access to all platform features.`,
      )
    )
      return;

    setActionLoading(true);
    try {
      await wrapApiCall(() => promoteToSuperAdmin(accountId));
      alert(`${detail.account.displayName} has been promoted to SuperAdmin.`);
      onUpdate();
    } catch (err) {
      alert(`Failed to promote: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDemoteFromSuperAdmin = async () => {
    if (!detail || !confirm(`Demote ${detail.account.displayName} from SuperAdmin?`)) return;

    setActionLoading(true);
    try {
      await wrapApiCall(() => demoteFromSuperAdmin(accountId));
      alert(`${detail.account.displayName} has been demoted from SuperAdmin.`);
      onUpdate();
    } catch (err) {
      alert(`Failed to demote: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (
      !detail ||
      !confirm(
        `Delete account ${detail.account.displayName}?\n\nThis action will soft-delete the account and cannot be easily undone.`,
      )
    )
      return;

    setActionLoading(true);
    try {
      await wrapApiCall(() => deleteAccount(accountId));
      alert(`Account ${detail.account.displayName} has been deleted.`);
      onClose();
      onUpdate();
    } catch (err) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Loading...</div>;
  }

  if (error || !detail) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ color: '#dc2626', marginBottom: '16px' }}>
          Error: {error ?? 'Account not found'}
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '8px 16px',
            backgroundColor: '#0ea5e9',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Back
        </button>
      </div>
    );
  }

  const isSuperAdmin = currentUser?.isSuperAdmin ?? false;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header with back button */}
      <button
        onClick={onClose}
        style={{
          padding: '8px 16px',
          backgroundColor: '#f1f5f9',
          color: '#0f172a',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          marginBottom: '16px',
        }}
      >
        ← Back to list
      </button>

      {/* User Summary Header */}
      <div
        style={{
          backgroundColor: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', gap: '20px', marginBottom: '16px' }}>
          {detail.primaryCharacter && (
            <img
              src={detail.primaryCharacter.portraitUrl}
              alt={detail.primaryCharacter.eveCharacterName}
              style={{
                width: '128px',
                height: '128px',
                borderRadius: '8px',
                objectFit: 'cover',
              }}
            />
          )}
          <div style={{ flex: 1 }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}
            >
              <h2 style={{ fontSize: '28px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                {detail.account.displayName}
              </h2>
              {detail.account.isSuperAdmin && (
                <span
                  style={{
                    padding: '4px 12px',
                    backgroundColor: '#fef3c7',
                    color: '#f59e0b',
                    fontSize: '14px',
                    fontWeight: '600',
                    borderRadius: '6px',
                  }}
                >
                  SuperAdmin
                </span>
              )}
              {detail.account.isBlocked && (
                <span
                  style={{
                    padding: '4px 12px',
                    backgroundColor: '#fef2f2',
                    color: '#dc2626',
                    fontSize: '14px',
                    fontWeight: '600',
                    borderRadius: '6px',
                  }}
                >
                  Blocked
                </span>
              )}
            </div>
            {detail.primaryCharacter && (
              <div style={{ fontSize: '16px', color: '#64748b', marginBottom: '8px' }}>
                {detail.primaryCharacter.eveCharacterName} • {detail.primaryCharacter.corpName}
                {detail.primaryCharacter.allianceName &&
                  ` • ${detail.primaryCharacter.allianceName}`}
              </div>
            )}
            <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
              <div>
                Account ID:{' '}
                <code
                  style={{
                    fontSize: '12px',
                    padding: '2px 6px',
                    backgroundColor: '#f1f5f9',
                    borderRadius: '4px',
                  }}
                >
                  {detail.account.id}
                </code>
              </div>
              <div>Email: {detail.account.email ?? 'None'}</div>
              <div>
                Created: {new Date(detail.account.createdAt).toLocaleDateString()} • Last Login:{' '}
                {detail.account.lastLoginAt
                  ? new Date(detail.account.lastLoginAt).toLocaleDateString()
                  : 'Never'}{' '}
                •{detail.stats.totalCharacters} characters
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {detail.account.isBlocked ? (
                <button
                  onClick={() => void handleUnblock()}
                  disabled={actionLoading}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    opacity: actionLoading ? 0.5 : 1,
                    fontWeight: '500',
                  }}
                >
                  Unblock Account
                </button>
              ) : (
                <button
                  onClick={() => void handleBlock()}
                  disabled={actionLoading}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    opacity: actionLoading ? 0.5 : 1,
                    fontWeight: '500',
                  }}
                >
                  Block Account
                </button>
              )}

              {isSuperAdmin && (
                <>
                  {detail.account.isSuperAdmin ? (
                    <button
                      onClick={() => void handleDemoteFromSuperAdmin()}
                      disabled={actionLoading}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: actionLoading ? 'not-allowed' : 'pointer',
                        opacity: actionLoading ? 0.5 : 1,
                        fontWeight: '500',
                      }}
                    >
                      Demote from SuperAdmin
                    </button>
                  ) : (
                    <button
                      onClick={() => void handlePromoteToSuperAdmin()}
                      disabled={actionLoading}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: actionLoading ? 'not-allowed' : 'pointer',
                        opacity: actionLoading ? 0.5 : 1,
                        fontWeight: '500',
                      }}
                    >
                      Promote to SuperAdmin
                    </button>
                  )}

                  <button
                    onClick={() => void handleDeleteAccount()}
                    disabled={actionLoading}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#71717a',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                      opacity: actionLoading ? 0.5 : 1,
                      fontWeight: '500',
                    }}
                  >
                    Delete Account
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Characters Grouped by Alliance/Corporation */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>
          Characters & Corporations ({detail.stats.totalCharacters})
        </h3>

        {detail.charactersGrouped.length === 0 ? (
          <div
            style={{
              padding: '32px',
              textAlign: 'center',
              color: '#64748b',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
            }}
          >
            No characters linked to this account
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '20px' }}>
            {detail.charactersGrouped.map((allianceGroup, idx) => (
              <div key={idx}>
                {/* Alliance Header */}
                {allianceGroup.allianceName && (
                  <div
                    style={{
                      padding: '12px 16px',
                      backgroundColor: '#0ea5e9',
                      color: 'white',
                      fontWeight: '600',
                      fontSize: '16px',
                      borderRadius: '8px 8px 0 0',
                    }}
                  >
                    {allianceGroup.allianceName}
                  </div>
                )}

                {/* Corporation Groups */}
                {allianceGroup.corporations.map((corp, corpIdx) => (
                  <div
                    key={corpIdx}
                    style={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: allianceGroup.allianceName
                        ? corpIdx === allianceGroup.corporations.length - 1
                          ? '0 0 8px 8px'
                          : '0'
                        : '8px',
                      marginTop:
                        allianceGroup.allianceName && corpIdx === 0 ? 0 : corpIdx === 0 ? 0 : '1px',
                    }}
                  >
                    {/* Corporation Header */}
                    <div
                      style={{
                        padding: '12px 16px',
                        backgroundColor: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        fontWeight: '600',
                        fontSize: '14px',
                        color: '#475569',
                      }}
                    >
                      {corp.corpName} — {corp.characters.length} character
                      {corp.characters.length !== 1 ? 's' : ''}
                    </div>

                    {/* Characters in this corporation */}
                    <div style={{ padding: '12px', display: 'grid', gap: '8px' }}>
                      {corp.characters.map((char) => (
                        <CharacterCard key={char.id} character={char} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Feature Roles Section */}
      <div>
        <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>
          Feature Roles ({detail.featureRoles.length})
        </h3>

        {detail.featureRoles.length === 0 ? (
          <div
            style={{
              padding: '32px',
              textAlign: 'center',
              color: '#64748b',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
            }}
          >
            No feature roles assigned
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {detail.featureRoles.map((role, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                }}
              >
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '500', color: '#0f172a' }}>
                    {role.featureName}
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>{role.featureKey}</div>
                </div>
                <span
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#f1f5f9',
                    color: '#0f172a',
                    fontSize: '14px',
                    fontWeight: '600',
                    borderRadius: '6px',
                    textTransform: 'capitalize',
                  }}
                >
                  {role.roleName}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// =================================================================
// MAIN ADMIN VIEW
// =================================================================

export const AdminView: React.FC = () => {
  const { user } = useAuth();
  const { wrapApiCall } = useApiCall();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadAccounts = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setLoading(true);
      setError(null);
      const data = await wrapApiCall(() =>
        fetchAccounts({ query: search || undefined, limit: 100 }, { signal: controller.signal }),
      );
      setAccounts(data.accounts);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();

    return () => abortRef.current?.abort();
  }, [search]);

  const isAdmin = user?.isSuperAdmin || user?.featureRoles.some((r) => r.roleKey === 'admin');

  if (!isAdmin) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '24px', color: '#dc2626', marginBottom: '16px' }}>Access Denied</h1>
        <p style={{ color: '#64748b' }}>You do not have permission to access this page.</p>
      </div>
    );
  }

  if (selectedAccountId) {
    return (
      <ViewUserPage
        accountId={selectedAccountId}
        onClose={() => setSelectedAccountId(null)}
        onUpdate={() => {
          setSelectedAccountId(null);
          void loadAccounts();
        }}
      />
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>
        Admin Console
      </h1>
      <p style={{ color: '#64748b', marginBottom: '24px' }}>
        Manage user accounts, permissions, and platform access
      </p>

      <div style={{ marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="Search accounts by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            fontSize: '14px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
          }}
        />
      </div>

      {loading && (
        <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
          Loading accounts...
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '16px',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            borderRadius: '6px',
            marginBottom: '16px',
          }}
        >
          Error: {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: 'grid', gap: '8px' }}>
          {accounts.map((account) => (
            <AccountListItem
              key={account.id}
              account={account}
              onSelect={() => setSelectedAccountId(account.id)}
            />
          ))}

          {accounts.length === 0 && (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: '#64748b' }}>
              {search ? `No accounts found for "${search}"` : 'No accounts found'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
