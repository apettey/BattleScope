'use client';

import { useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Badge } from '@/components/Badge';
import { SystemName } from '@/components/SystemName';
import { CharacterAvatar } from '@/components/CharacterAvatar';
import { ShipIcon } from '@/components/ShipIcon';
import api from '@/lib/api';
import { ExternalLink, Filter, RefreshCw } from 'lucide-react';
import {
  formatISK,
  formatRelativeTime,
  formatDate,
  getZKillURL,
} from '@/lib/utils';
import type { Killmail } from '@/lib/types';

export default function IntelPage() {
  const [killmails, setKillmails] = useState<Killmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [minISK, setMinISK] = useState('');
  const [securityFilter, setSecurityFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchKillmails();

    // Auto-refresh every 30 seconds
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchKillmails, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, minISK, securityFilter]);

  const fetchKillmails = async () => {
    try {
      const params: any = { limit: 50 };
      if (minISK) params.min_value = parseInt(minISK) * 1000000; // Convert M to ISK
      if (securityFilter !== 'all') params.security_type = securityFilter;

      const response = await api.get('/api/intel/live', { params });
      setKillmails(response.data.killmails || response.data);
    } catch (error) {
      console.error('Failed to fetch killmails:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Battle Intel</h1>
            <p className="text-gray-400 mt-1">
              Live killmail feed from across New Eden
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`}
              />
              {autoRefresh ? 'Auto-Refresh On' : 'Auto-Refresh Off'}
            </Button>
            <Button size="sm" onClick={fetchKillmails}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Now
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Input
                type="number"
                placeholder="Min ISK value (millions)"
                value={minISK}
                onChange={(e) => setMinISK(e.target.value)}
                label="Minimum Value"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Security Filter
              </label>
              <select
                value={securityFilter}
                onChange={(e) => setSecurityFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-eve-blue"
              >
                <option value="all">All Security</option>
                <option value="High-Sec">High-Sec</option>
                <option value="Low-Sec">Low-Sec</option>
                <option value="Null-Sec">Null-Sec</option>
                <option value="W-Space">Wormhole</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setMinISK('');
                  setSecurityFilter('all');
                }}
              >
                <Filter className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </div>
        </Card>

        {/* Killmail Feed */}
        <Card>
          {isLoading ? (
            <LoadingSpinner />
          ) : killmails.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No killmails found</p>
              <p className="text-sm text-gray-600 mt-2">
                Try adjusting your filters or wait for new kills
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {killmails.map((km) => (
                <div
                  key={km.killmail_id}
                  className="p-4 bg-gray-900/50 rounded-lg hover:bg-gray-900 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    {/* Ship Icon (placeholder for now) */}
                    <div className="flex-shrink-0 w-16 h-16 bg-gray-800 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">🚀</span>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-base font-semibold text-white">
                              {km.victim_name}
                            </h3>
                            <span className="text-gray-400">lost a</span>
                            <span className="text-eve-blue font-medium">
                              {km.ship_type_name}
                            </span>
                          </div>
                          {km.victim_alliance && (
                            <p className="text-sm text-gray-400">
                              {km.victim_alliance}
                            </p>
                          )}
                        </div>
                        <div className="text-right ml-4">
                          <div className="text-lg font-bold text-red-400">
                            {formatISK(km.isk_value)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatRelativeTime(km.occurred_at)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <SystemName
                          systemName={km.system_name}
                          regionName={km.region_name}
                          className="flex-shrink-0"
                        />
                        <a
                          href={getZKillURL(km.killmail_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-eve-blue hover:text-eve-blue/80 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>View on zKillboard</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-eve-blue/10 border border-eve-blue/30 rounded-lg">
          <p className="text-sm text-gray-300">
            <strong className="text-white">Live Feed:</strong> Killmails are
            updated automatically every 30 seconds. Use filters to focus on
            specific types of activity.
          </p>
        </div>
      </div>
    </>
  );
}
