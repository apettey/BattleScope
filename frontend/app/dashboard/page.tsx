'use client';

import { useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/Card';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Badge } from '@/components/Badge';
import api from '@/lib/api';
import { Activity, Users, Swords, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { formatISK, formatRelativeTime, formatNumber } from '@/lib/utils';
import type { DashboardStats, Battle } from '@/lib/types';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentBattles, setRecentBattles] = useState<Battle[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, battlesRes, healthRes] = await Promise.all([
          api.get('/api/stats/summary'),
          api.get('/api/battles?limit=5'),
          api.get('/api/health'),
        ]);

        setStats(statsRes.data);
        setRecentBattles(battlesRes.data.battles || battlesRes.data);
        setHealth(healthRes.data);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <>
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <LoadingSpinner size="lg" />
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">
            Welcome to BattleScope V3 - Your EVE Online battle intelligence hub
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Battles"
            value={formatNumber(stats?.total_battles || 0)}
            icon={<Swords className="h-6 w-6" />}
            color="text-eve-blue"
          />
          <StatCard
            title="Total Killmails"
            value={formatNumber(stats?.total_killmails || 0)}
            icon={<Activity className="h-6 w-6" />}
            color="text-green-400"
          />
          <StatCard
            title="Active Users"
            value={formatNumber(stats?.active_users || 0)}
            icon={<Users className="h-6 w-6" />}
            color="text-yellow-400"
          />
          <StatCard
            title="Recent Activity"
            value={formatNumber(stats?.recent_activity || 0)}
            icon={<TrendingUp className="h-6 w-6" />}
            color="text-purple-400"
          />
        </div>

        {/* Service Health */}
        {health && (
          <Card title="Service Health" className="mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ServiceStatus name="Ingestion" status={health.ingestion || 'unknown'} />
              <ServiceStatus name="Enrichment" status={health.enrichment || 'unknown'} />
              <ServiceStatus name="Battle Clusterer" status={health.battle || 'unknown'} />
            </div>
          </Card>
        )}

        {/* Recent Battles */}
        <Card
          title="Recent Battles"
          action={
            <Link
              href="/battles"
              className="text-sm text-eve-blue hover:text-eve-blue/80"
            >
              View all
            </Link>
          }
        >
          {recentBattles.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No recent battles found
            </p>
          ) : (
            <div className="space-y-4">
              {recentBattles.map((battle) => (
                <Link
                  key={battle.id}
                  href={`/battles/${battle.id}`}
                  className="block p-4 bg-gray-900/50 rounded-lg hover:bg-gray-900 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-white">
                          {battle.system_name}
                        </h3>
                        <Badge variant="info">{battle.security_type}</Badge>
                      </div>
                      <p className="text-sm text-gray-400">
                        {battle.region_name}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatRelativeTime(battle.start_time)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-red-400">
                        {formatISK(battle.total_isk_destroyed)}
                      </div>
                      <div className="text-sm text-gray-400">
                        {battle.total_kills} kills
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400 mb-1">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
        <div className={color}>{icon}</div>
      </div>
    </Card>
  );
}

function ServiceStatus({
  name,
  status,
}: {
  name: string;
  status: string;
}) {
  const getVariant = () => {
    if (status === 'healthy' || status === 'ok') return 'success';
    if (status === 'degraded') return 'warning';
    return 'danger';
  };

  return (
    <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded">
      <span className="text-sm font-medium text-gray-300">{name}</span>
      <Badge variant={getVariant()}>{status}</Badge>
    </div>
  );
}
