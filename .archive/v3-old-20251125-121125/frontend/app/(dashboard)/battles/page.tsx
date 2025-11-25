'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import api, { setAuthToken } from '@/lib/api';
import { Radar, MapPin, Users, Skull, TrendingUp, Clock, Ship } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Battle {
  id: string;
  system: string;
  region: string;
  status: 'active' | 'ended';
  startTime: string;
  endTime?: string;
  participants: number;
  kills: number;
  iskDestroyed: number;
  topAlliances: string[];
}

interface BattleDetails extends Battle {
  timeline: Array<{ time: string; kills: number }>;
  topShips: Array<{ shipType: string; count: number }>;
}

export default function BattlesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [battles, setBattles] = useState<Battle[]>([]);
  const [selectedBattle, setSelectedBattle] = useState<BattleDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'ended'>('active');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    } else if (status === 'authenticated' && session) {
      setAuthToken((session as any).accessToken);
      fetchBattles();
    }
  }, [status, session, router]);

  const fetchBattles = async () => {
    try {
      const response = await api.get('/battles').catch(() => ({ data: [] }));
      setBattles(response.data || [
        {
          id: '1',
          system: 'M-OEE8',
          region: 'Delve',
          status: 'active',
          startTime: new Date(Date.now() - 3600000).toISOString(),
          participants: 234,
          kills: 45,
          iskDestroyed: 25000000000,
          topAlliances: ['Goonswarm Federation', 'Test Alliance', 'Pandemic Legion'],
        },
        {
          id: '2',
          system: '1DQ1-A',
          region: 'Delve',
          status: 'active',
          startTime: new Date(Date.now() - 7200000).toISOString(),
          participants: 156,
          kills: 23,
          iskDestroyed: 12000000000,
          topAlliances: ['Goonswarm Federation', 'Brave Collective'],
        },
        {
          id: '3',
          system: 'T5ZI-S',
          region: 'Delve',
          status: 'ended',
          startTime: new Date(Date.now() - 14400000).toISOString(),
          endTime: new Date(Date.now() - 3600000).toISOString(),
          participants: 89,
          kills: 67,
          iskDestroyed: 45000000000,
          topAlliances: ['Test Alliance', 'Pandemic Legion'],
        },
      ]);
    } catch (error) {
      console.error('Failed to fetch battles:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBattleDetails = async (battleId: string) => {
    try {
      const response = await api.get(`/battles/${battleId}`).catch(() => ({
        data: {
          ...battles.find((b) => b.id === battleId),
          timeline: [
            { time: '00:00', kills: 5 },
            { time: '00:15', kills: 12 },
            { time: '00:30', kills: 18 },
            { time: '00:45', kills: 25 },
            { time: '01:00', kills: 30 },
          ],
          topShips: [
            { shipType: 'Interceptor', count: 45 },
            { shipType: 'Cruiser', count: 38 },
            { shipType: 'Battleship', count: 25 },
            { shipType: 'Frigate', count: 20 },
          ],
        },
      }));
      setSelectedBattle(response.data);
    } catch (error) {
      console.error('Failed to fetch battle details:', error);
    }
  };

  const filteredBattles = battles.filter((b) => filter === 'all' || b.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-400">Loading battles...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Battle Monitor</h1>
        <p className="text-slate-400">Track active and historical battles in New Eden</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter('active')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'active'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Active Battles
        </button>
        <button
          onClick={() => setFilter('ended')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'ended'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Ended Battles
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          All
        </button>
      </div>

      {/* Battle List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          {filteredBattles.map((battle) => (
            <BattleCard
              key={battle.id}
              battle={battle}
              selected={selectedBattle?.id === battle.id}
              onClick={() => fetchBattleDetails(battle.id)}
            />
          ))}
          {filteredBattles.length === 0 && (
            <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center text-slate-400">
              No {filter !== 'all' ? filter : ''} battles found
            </div>
          )}
        </div>

        {/* Battle Details */}
        {selectedBattle && (
          <div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4">Battle Timeline</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={selectedBattle.timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                  <XAxis dataKey="time" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #475569',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="kills" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Ship className="w-5 h-5 text-blue-400" />
                Top Ship Types
              </h2>
              <div className="space-y-3">
                {selectedBattle.topShips.map((ship) => (
                  <div key={ship.shipType} className="flex items-center justify-between">
                    <span className="text-slate-300">{ship.shipType}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{
                            width: `${(ship.count / selectedBattle.topShips[0].count) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-white font-medium w-8 text-right">{ship.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BattleCard({
  battle,
  selected,
  onClick,
}: {
  battle: Battle;
  selected: boolean;
  onClick: () => void;
}) {
  const formatISK = (isk: number) => {
    if (isk >= 1e9) return `${(isk / 1e9).toFixed(1)}B ISK`;
    if (isk >= 1e6) return `${(isk / 1e6).toFixed(1)}M ISK`;
    return `${isk.toLocaleString()} ISK`;
  };

  const duration = battle.endTime
    ? Math.floor((new Date(battle.endTime).getTime() - new Date(battle.startTime).getTime()) / 60000)
    : Math.floor((Date.now() - new Date(battle.startTime).getTime()) / 60000);

  return (
    <div
      onClick={onClick}
      className={`bg-slate-800 rounded-lg p-5 border cursor-pointer transition-all ${
        selected ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-slate-700 hover:border-slate-600'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Radar className="w-5 h-5 text-blue-400" />
            <h3 className="text-xl font-semibold text-white">{battle.system}</h3>
            <span
              className={`px-2 py-1 rounded text-xs font-semibold ${
                battle.status === 'active'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {battle.status}
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <MapPin className="w-4 h-4" />
            {battle.region}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-3">
        <div>
          <div className="flex items-center gap-1 text-slate-400 text-xs mb-1">
            <Users className="w-3 h-3" />
            Participants
          </div>
          <div className="text-white font-semibold">{battle.participants}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-slate-400 text-xs mb-1">
            <Skull className="w-3 h-3" />
            Kills
          </div>
          <div className="text-white font-semibold">{battle.kills}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-slate-400 text-xs mb-1">
            <TrendingUp className="w-3 h-3" />
            Destroyed
          </div>
          <div className="text-white font-semibold">{formatISK(battle.iskDestroyed)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-slate-400 text-sm mb-3">
        <Clock className="w-4 h-4" />
        Duration: {duration} minutes
      </div>

      <div>
        <div className="text-slate-400 text-xs mb-2">Top Alliances:</div>
        <div className="flex flex-wrap gap-2">
          {battle.topAlliances.slice(0, 3).map((alliance) => (
            <span
              key={alliance}
              className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300"
            >
              {alliance}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
