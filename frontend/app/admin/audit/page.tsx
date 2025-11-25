'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Table } from '@/components/Table';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Badge } from '@/components/Badge';
import api from '@/lib/api';
import { ArrowLeft } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: any;
  created_at: string;
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const fetchAuditLogs = async () => {
    try {
      const response = await api.get('/api/admin/audit', {
        params: { limit: 100 },
      });
      setLogs(response.data.logs || response.data);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    if (action.includes('create')) return 'success';
    if (action.includes('delete') || action.includes('block')) return 'danger';
    if (action.includes('update') || action.includes('modify')) return 'warning';
    return 'default';
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
          <h1 className="text-3xl font-bold text-white">Audit Logs</h1>
          <p className="text-gray-400 mt-1">
            View system audit trail and administrative actions
          </p>
        </div>

        <Card>
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <Table
              columns={[
                {
                  key: 'timestamp',
                  header: 'Timestamp',
                  render: (log: AuditLog) => (
                    <span className="text-gray-300">
                      {formatDate(log.created_at)}
                    </span>
                  ),
                },
                {
                  key: 'action',
                  header: 'Action',
                  render: (log: AuditLog) => (
                    <Badge variant={getActionBadge(log.action) as any}>
                      {log.action}
                    </Badge>
                  ),
                },
                {
                  key: 'resource',
                  header: 'Resource',
                  render: (log: AuditLog) => (
                    <div>
                      <div className="text-white font-medium">
                        {log.resource_type}
                      </div>
                      <div className="text-xs text-gray-500">
                        ID: {log.resource_id}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'user',
                  header: 'User',
                  render: (log: AuditLog) => (
                    <span className="text-gray-300 text-sm">
                      {log.user_id}
                    </span>
                  ),
                },
                {
                  key: 'details',
                  header: 'Details',
                  render: (log: AuditLog) => (
                    <span className="text-gray-400 text-sm truncate max-w-xs">
                      {log.details ? JSON.stringify(log.details) : '-'}
                    </span>
                  ),
                },
              ]}
              data={logs}
              keyExtractor={(log) => log.id}
              emptyMessage="No audit logs found"
            />
          )}
        </Card>
      </div>
    </>
  );
}
