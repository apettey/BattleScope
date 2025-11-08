/**
 * Admin console for user and role management
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext.js';
import {
  fetchAccounts,
  fetchAccountDetail,
  blockAccount,
  unblockAccount,
  type Account,
  type AccountDetail,
} from '../api.js';

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
          Super Admin
        </span>
      )}
    </div>
    <div style={{ fontSize: '12px', color: '#64748b' }}>
      {account.email ?? 'No email'}
      {account.lastLoginAt &&
        ` • Last login: ${new Date(account.lastLoginAt).toLocaleDateString()}`}
    </div>
  </button>
);

const AccountDetail: React.FC<{
  accountId: string;
  onClose: () => void;
  onUpdate: () => void;
}> = ({ accountId, onClose, onUpdate }) => {
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        const data = await fetchAccountDetail(accountId, { signal: abortController.signal });
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
  }, [accountId]);

  const handleBlock = async () => {
    if (!detail || !confirm(`Block user ${detail.displayName}?`)) return;

    setActionLoading(true);
    try {
      await blockAccount(accountId);
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
      await unblockAccount(accountId);
      onUpdate();
    } catch (err) {
      alert(`Failed to unblock: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
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

        <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>
          {detail.displayName}
        </h2>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {detail.isBlocked ? (
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
              }}
            >
              Unblock
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
              }}
            >
              Block
            </button>
          )}
        </div>

        <div
          style={{
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', color: '#64748b' }}>Email: </span>
            <span style={{ fontSize: '14px', color: '#0f172a' }}>{detail.email ?? 'None'}</span>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', color: '#64748b' }}>Status: </span>
            <span
              style={{
                fontSize: '14px',
                color: detail.isBlocked ? '#dc2626' : '#10b981',
                fontWeight: '500',
              }}
            >
              {detail.isBlocked ? 'Blocked' : 'Active'}
            </span>
          </div>
          {detail.lastLoginAt && (
            <div>
              <span style={{ fontSize: '14px', color: '#64748b' }}>Last login: </span>
              <span style={{ fontSize: '14px', color: '#0f172a' }}>
                {new Date(detail.lastLoginAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', marginBottom: '12px' }}>
          Roles ({detail.featureRoles.length})
        </h3>

        {detail.featureRoles.length === 0 ? (
          <div
            style={{
              padding: '16px',
              textAlign: 'center',
              color: '#64748b',
              backgroundColor: '#f8fafc',
              borderRadius: '6px',
            }}
          >
            No roles assigned
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {detail.featureRoles.map((role, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '12px',
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: '#0f172a' }}>
                    {role.featureName}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{role.featureKey}</div>
                </div>
                <span
                  style={{
                    padding: '4px 12px',
                    backgroundColor: '#f1f5f9',
                    color: '#0f172a',
                    fontSize: '14px',
                    fontWeight: '500',
                    borderRadius: '4px',
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

export const AdminView: React.FC = () => {
  const { user } = useAuth();
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
      const data = await fetchAccounts(
        { query: search || undefined, limit: 100 },
        { signal: controller.signal },
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
      <AccountDetail
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
      <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#0f172a', marginBottom: '24px' }}>
        Admin Console
      </h1>

      <div style={{ marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="Search accounts..."
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
        <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
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
              No accounts found
            </div>
          )}
        </div>
      )}
    </div>
  );
};
