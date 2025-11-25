'use client';

import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/Card';
import { Users, Shield, Settings, FileText } from 'lucide-react';

export default function AdminPage() {
  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
          <p className="text-gray-400 mt-1">
            System administration and user management
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AdminCard
            href="/admin/accounts"
            icon={<Users className="h-8 w-8" />}
            title="Account Management"
            description="View and manage user accounts, assign roles, and monitor activity"
          />
          <AdminCard
            href="/admin/roles"
            icon={<Shield className="h-8 w-8" />}
            title="Role Management"
            description="Configure roles and permissions for different features"
          />
          <AdminCard
            href="/admin/config"
            icon={<Settings className="h-8 w-8" />}
            title="System Configuration"
            description="Configure corp/alliance access and system settings"
          />
          <AdminCard
            href="/admin/audit"
            icon={<FileText className="h-8 w-8" />}
            title="Audit Logs"
            description="View audit trail of administrative actions"
          />
        </div>
      </div>
    </>
  );
}

function AdminCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-eve-blue transition-colors cursor-pointer h-full">
        <div className="flex items-start gap-4">
          <div className="text-eve-blue flex-shrink-0">{icon}</div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
            <p className="text-sm text-gray-400">{description}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
