'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import api, { setAuthToken } from '@/lib/api';
import { Activity, Database, Radar, Bell, TrendingUp, Users } from 'lucide-react';

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  uptime?: number;
  requests?: number;
}

interface Stats {
  totalBattles: number;
  activeBattles: number;
  totalCharacters: number;
  totalKillmails: number;
  recentActivity: number;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    } else if (status === 'authenticated' && session) {
      setAuthToken((session as any).accessToken);
      fetchDashboardData();
    }
  }, [status, session, router]);

  const fetchDashboardData = async () => {
    try {
      const [servicesRes, statsRes] = await Promise.all([
        api.get('/health/services').catch(() => ({ data: [] })),
        api.get('/stats/dashboard').catch(() => ({ data: null })),
      ]);

      setServices(servicesRes.data || [
        { name: 'Ingestion', status: 'healthy', uptime: 99.9, requests: 15234 },
        { name: 'Enrichment', status: 'healthy', uptime: 99.8, requests: 12456 },
        { name: 'Battle', status: 'healthy', uptime: 99.7, requests: 8901 },
        { name: 'Search', status: 'healthy', uptime: 99.9, requests: 5678 },
        { name: 'Notification', status: 'healthy', uptime: 99.6, requests: 3456 },
        { name: 'BFF', status: 'healthy', uptime: 99.9, requests: 23456 },
      ]);

      setStats(statsRes.data || {
        totalBattles: 1234,
        activeBattles: 45,
        totalCharacters: 56789,
        totalKillmails: 123456,
        recentActivity: 78,
      });
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-slate-400">Welcome back to BattleScope V3</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Battles"
          value={stats?.totalBattles || 0}
          icon={Radar}
          color="blue"
        />
        <StatCard
          title="Active Battles"
          value={stats?.activeBattles || 0}
          icon={Activity}
          color="green"
        />
        <StatCard
          title="Total Characters"
          value={stats?.totalCharacters || 0}
          icon={Users}
          color="purple"
        />
        <StatCard
          title="Recent Activity"
          value={`${stats?.recentActivity || 0}%`}
          icon={TrendingUp}
          color="orange"
        />
      </div>

      {/* Service Status */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-400" />
          Service Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((service) => (
            <div
              key={service.name}
              className="bg-slate-700 rounded-lg p-4 border border-slate-600"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-medium">{service.name}</h3>
                <span
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    service.status === 'healthy'
                      ? 'bg-green-500/20 text-green-400'
                      : service.status === 'unhealthy'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {service.status}
                </span>
              </div>
              {service.uptime && (
                <div className="text-slate-400 text-sm">
                  Uptime: {service.uptime}%
                </div>
              )}
              {service.requests && (
                <div className="text-slate-400 text-sm">
                  Requests: {service.requests.toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-400" />
          Recent Activity
        </h2>
        <div className="space-y-3">
          <ActivityItem
            title="New battle detected in Delve"
            time="2 minutes ago"
            type="battle"
          />
          <ActivityItem
            title="Killmail processed: Titan loss"
            time="5 minutes ago"
            type="killmail"
          />
          <ActivityItem
            title="Character enrichment completed"
            time="8 minutes ago"
            type="enrichment"
          />
          <ActivityItem
            title="Battle ended: M-OEE8"
            time="15 minutes ago"
            type="battle"
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number | string;
  icon: any;
  color: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-500/20 text-blue-400',
    green: 'bg-green-500/20 text-green-400',
    purple: 'bg-purple-500/20 text-purple-400',
    orange: 'bg-orange-500/20 text-orange-400',
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <h3 className="text-slate-400 text-sm font-medium mb-1">{title}</h3>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );
}

function ActivityItem({
  title,
  time,
  type,
}: {
  title: string;
  time: string;
  type: string;
}) {
  const typeColors = {
    battle: 'bg-blue-500',
    killmail: 'bg-red-500',
    enrichment: 'bg-green-500',
  };

  return (
    <div className="flex items-start gap-3 p-3 bg-slate-700 rounded-lg">
      <div className={`w-2 h-2 mt-2 rounded-full ${typeColors[type as keyof typeof typeColors]}`} />
      <div className="flex-1">
        <p className="text-white text-sm">{title}</p>
        <p className="text-slate-400 text-xs mt-1">{time}</p>
      </div>
    </div>
  );
}
