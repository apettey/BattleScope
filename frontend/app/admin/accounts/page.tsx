'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Table } from '@/components/Table';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import api from '@/lib/api';
import { ArrowLeft, Ban, CheckCircle } from 'lucide-react';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import type { AdminAccount } from '@/lib/types';

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<AdminAccount | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const response = await api.get('/api/admin/accounts');
      setAccounts(response.data.accounts || response.data);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async (account: AdminAccount) => {
    setIsUpdating(true);
    try {
      await api.put(`/api/admin/accounts/${account.id}`, {
        is_active: !account.is_active,
      });
      fetchAccounts();
      setSelectedAccount(null);
    } catch (error) {
      console.error('Failed to update account:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Account Management</h1>
          <p className="text-gray-400 mt-1">
            View and manage user accounts
          </p>
        </div>

        <Card>
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <Table
              columns={[
                {
                  key: 'character',
                  header: 'Primary Character',
                  render: (account: AdminAccount) => (
                    <span className="text-white">
                      {account.primary_character_name || 'Not set'}
                    </span>
                  ),
                },
                {
                  key: 'characters',
                  header: 'Characters',
                  render: (account: AdminAccount) => (
                    <span className="text-gray-300">
                      {account.character_count}
                    </span>
                  ),
                },
                {
                  key: 'created',
                  header: 'Created',
                  render: (account: AdminAccount) => (
                    <span className="text-gray-300">
                      {formatDate(account.created_at)}
                    </span>
                  ),
                },
                {
                  key: 'last_login',
                  header: 'Last Login',
                  render: (account: AdminAccount) => (
                    <span className="text-gray-300">
                      {formatRelativeTime(account.last_login_at)}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (account: AdminAccount) => (
                    <Badge variant={account.is_active ? 'success' : 'danger'}>
                      {account.is_active ? 'Active' : 'Blocked'}
                    </Badge>
                  ),
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  render: (account: AdminAccount) => (
                    <Button
                      variant={account.is_active ? 'danger' : 'secondary'}
                      size="sm"
                      onClick={() => setSelectedAccount(account)}
                    >
                      {account.is_active ? (
                        <>
                          <Ban className="h-4 w-4 mr-1" />
                          Block
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Unblock
                        </>
                      )}
                    </Button>
                  ),
                },
              ]}
              data={accounts}
              keyExtractor={(account) => account.id}
              emptyMessage="No accounts found"
            />
          )}
        </Card>

        {/* Confirmation Modal */}
        <Modal
          isOpen={selectedAccount !== null}
          onClose={() => setSelectedAccount(null)}
          title={
            selectedAccount?.is_active ? 'Block Account' : 'Unblock Account'
          }
          footer={
            <>
              <Button variant="ghost" onClick={() => setSelectedAccount(null)}>
                Cancel
              </Button>
              <Button
                variant={selectedAccount?.is_active ? 'danger' : 'secondary'}
                onClick={() =>
                  selectedAccount && handleToggleActive(selectedAccount)
                }
                isLoading={isUpdating}
              >
                {selectedAccount?.is_active ? 'Block' : 'Unblock'}
              </Button>
            </>
          }
        >
          <p className="text-gray-300">
            Are you sure you want to{' '}
            {selectedAccount?.is_active ? 'block' : 'unblock'} the account for{' '}
            <span className="font-semibold text-white">
              {selectedAccount?.primary_character_name}
            </span>
            ?
          </p>
          {selectedAccount?.is_active && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-700 rounded">
              <p className="text-sm text-red-400">
                Blocked users will not be able to access the system.
              </p>
            </div>
          )}
        </Modal>
      </div>
    </>
  );
}
