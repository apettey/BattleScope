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
import { ArrowLeft, Shield } from 'lucide-react';
import type { Role } from '@/lib/types';

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      const response = await api.get('/api/admin/roles');
      setRoles(response.data.roles || response.data);
    } catch (error) {
      console.error('Failed to fetch roles:', error);
    } finally {
      setIsLoading(false);
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
          <h1 className="text-3xl font-bold text-white">Role Management</h1>
          <p className="text-gray-400 mt-1">
            Configure roles and permissions
          </p>
        </div>

        <Card>
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <Table
              columns={[
                {
                  key: 'name',
                  header: 'Role Name',
                  render: (role: Role) => (
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-eve-blue" />
                      <span className="text-white font-medium">{role.name}</span>
                    </div>
                  ),
                },
                {
                  key: 'feature',
                  header: 'Feature',
                  render: (role: Role) => (
                    <Badge variant="info">{role.feature}</Badge>
                  ),
                },
                {
                  key: 'permissions',
                  header: 'Permissions',
                  render: (role: Role) => (
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.map((perm) => (
                        <Badge key={perm} variant="default">
                          {perm}
                        </Badge>
                      ))}
                    </div>
                  ),
                },
              ]}
              data={roles}
              keyExtractor={(role) => role.id}
              emptyMessage="No roles configured"
            />
          )}
        </Card>

        <div className="mt-6 p-4 bg-eve-blue/10 border border-eve-blue/30 rounded-lg">
          <p className="text-sm text-gray-300">
            <strong className="text-white">Role Hierarchy:</strong> User &lt; FC &lt; Director &lt; Admin &lt; SuperAdmin
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Roles can be assigned per feature (battle-reports, battle-intel) to control access to specific functionality.
          </p>
        </div>
      </div>
    </>
  );
}
