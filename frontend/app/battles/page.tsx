'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Badge } from '@/components/Badge';
import { SystemName } from '@/components/SystemName';
import api from '@/lib/api';
import { Search, Filter } from 'lucide-react';
import { formatISK, formatRelativeTime, formatDate } from '@/lib/utils';
import type { Battle } from '@/lib/types';

export default function BattlesPage() {
  const [battles, setBattles] = useState<Battle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [securityFilter, setSecurityFilter] = useState<string>('all');

  useEffect(() => {
    fetchBattles();
  }, []);

  const fetchBattles = async () => {
    try {
      const response = await api.get('/api/battles', {
        params: {
          limit: 50,
          security_type: securityFilter !== 'all' ? securityFilter : undefined,
        },
      });
      setBattles(response.data.battles || response.data);
    } catch (error) {
      console.error('Failed to fetch battles:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredBattles = battles.filter((battle) =>
    battle.system_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Battle Reports</h1>
          <p className="text-gray-400 mt-1">
            View and analyze reconstructed battles across New Eden
          </p>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Input
                placeholder="Search by system name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <select
                value={securityFilter}
                onChange={(e) => {
                  setSecurityFilter(e.target.value);
                  fetchBattles();
                }}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-eve-blue"
              >
                <option value="all">All Security</option>
                <option value="High-Sec">High-Sec</option>
                <option value="Low-Sec">Low-Sec</option>
                <option value="Null-Sec">Null-Sec</option>
                <option value="W-Space">Wormhole</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Battle List */}
        <Card>
          {isLoading ? (
            <LoadingSpinner />
          ) : filteredBattles.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No battles found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBattles.map((battle) => (
                <Link
                  key={battle.id}
                  href={`/battles/${battle.id}`}
                  className="block p-4 bg-gray-900/50 rounded-lg hover:bg-gray-900 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <SystemName
                          systemName={battle.system_name}
                          regionName={battle.region_name}
                        />
                        <Badge variant="info">{battle.security_type}</Badge>
                        {battle.end_time ? (
                          <Badge variant="default">Ended</Badge>
                        ) : (
                          <Badge variant="warning">Ongoing</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        <span>{formatRelativeTime(battle.start_time)}</span>
                        <span>•</span>
                        <span>{formatDate(battle.start_time)}</span>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-xl font-bold text-red-400 mb-1">
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
