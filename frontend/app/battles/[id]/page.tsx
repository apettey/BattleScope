'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Badge } from '@/components/Badge';
import { Table } from '@/components/Table';
import { SystemName } from '@/components/SystemName';
import { CharacterAvatar } from '@/components/CharacterAvatar';
import { ShipIcon } from '@/components/ShipIcon';
import api from '@/lib/api';
import {
  ArrowLeft,
  ExternalLink,
  Users,
  Swords,
  TrendingUp,
  Clock,
} from 'lucide-react';
import {
  formatISK,
  formatDate,
  formatNumber,
  getZKillURL,
} from '@/lib/utils';
import type { Battle, BattleParticipant } from '@/lib/types';

export default function BattleDetailPage() {
  const params = useParams();
  const battleId = params?.id as string;

  const [battle, setBattle] = useState<Battle | null>(null);
  const [participants, setParticipants] = useState<BattleParticipant[]>([]);
  const [killmails, setKillmails] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'participants' | 'timeline'>(
    'overview'
  );

  useEffect(() => {
    if (battleId) {
      fetchBattleData();
    }
  }, [battleId]);

  const fetchBattleData = async () => {
    try {
      const [battleRes, participantsRes, killmailsRes] = await Promise.all([
        api.get(`/api/battles/${battleId}`),
        api.get(`/api/battles/${battleId}/participants`),
        api.get(`/api/battles/${battleId}/timeline`),
      ]);

      setBattle(battleRes.data);
      setParticipants(participantsRes.data);
      setKillmails(killmailsRes.data);
    } catch (error) {
      console.error('Failed to fetch battle data:', error);
    } finally {
      setIsLoading(false);
    }
  };

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

  if (!battle) {
    return (
      <>
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-500">Battle not found</p>
              <Link href="/battles" className="mt-4 inline-block">
                <Button>Back to Battles</Button>
              </Link>
            </div>
          </Card>
        </div>
      </>
    );
  }

  const duration = battle.end_time
    ? Math.round(
        (new Date(battle.end_time).getTime() -
          new Date(battle.start_time).getTime()) /
          60000
      )
    : 'Ongoing';

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link href="/battles">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Battles
            </Button>
          </Link>
        </div>

        {/* Battle Overview */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-white">
                  {battle.system_name}
                </h1>
                <Badge variant="info">{battle.security_type}</Badge>
                {battle.end_time ? (
                  <Badge variant="default">Ended</Badge>
                ) : (
                  <Badge variant="warning">Ongoing</Badge>
                )}
              </div>
              <p className="text-gray-400">{battle.region_name}</p>
            </div>
            {battle.zkill_related_url && (
              <a
                href={battle.zkill_related_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="secondary">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on zKillboard
                </Button>
              </a>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="ISK Destroyed"
              value={formatISK(battle.total_isk_destroyed)}
              color="text-red-400"
            />
            <StatCard
              icon={<Swords className="h-5 w-5" />}
              label="Total Kills"
              value={formatNumber(battle.total_kills)}
              color="text-yellow-400"
            />
            <StatCard
              icon={<Users className="h-5 w-5" />}
              label="Participants"
              value={formatNumber(participants.length)}
              color="text-blue-400"
            />
            <StatCard
              icon={<Clock className="h-5 w-5" />}
              label="Duration"
              value={typeof duration === 'number' ? `${duration} min` : duration}
              color="text-green-400"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-800">
          <div className="flex gap-4">
            <TabButton
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </TabButton>
            <TabButton
              active={activeTab === 'participants'}
              onClick={() => setActiveTab('participants')}
            >
              Participants ({participants.length})
            </TabButton>
            <TabButton
              active={activeTab === 'timeline'}
              onClick={() => setActiveTab('timeline')}
            >
              Timeline ({killmails.length})
            </TabButton>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <Card title="Battle Information">
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoRow label="Started" value={formatDate(battle.start_time)} />
                {battle.end_time && (
                  <InfoRow label="Ended" value={formatDate(battle.end_time)} />
                )}
                <InfoRow label="System" value={battle.system_name} />
                <InfoRow label="Region" value={battle.region_name} />
                <InfoRow label="Security" value={battle.security_type} />
                <InfoRow label="Total Kills" value={battle.total_kills.toString()} />
              </dl>
            </Card>
          </div>
        )}

        {activeTab === 'participants' && (
          <Card>
            <Table
              columns={[
                {
                  key: 'character',
                  header: 'Character',
                  render: (p: BattleParticipant) => (
                    <div className="flex items-center gap-2">
                      <CharacterAvatar
                        characterId={p.character_id}
                        characterName={p.character_name || 'Unknown'}
                        size={32}
                      />
                      <span className="text-white">{p.character_name}</span>
                    </div>
                  ),
                },
                {
                  key: 'corp',
                  header: 'Corporation',
                  render: (p: BattleParticipant) => (
                    <span className="text-gray-300">{p.corp_name}</span>
                  ),
                },
                {
                  key: 'alliance',
                  header: 'Alliance',
                  render: (p: BattleParticipant) => (
                    <span className="text-gray-300">
                      {p.alliance_name || '-'}
                    </span>
                  ),
                },
                {
                  key: 'ship',
                  header: 'Ship',
                  render: (p: BattleParticipant) => (
                    <span className="text-gray-300">{p.ship_type_name}</span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (p: BattleParticipant) => (
                    <Badge variant={p.is_victim ? 'danger' : 'default'}>
                      {p.is_victim ? 'Victim' : 'Attacker'}
                    </Badge>
                  ),
                },
              ]}
              data={participants}
              keyExtractor={(p) => `${p.character_id}`}
            />
          </Card>
        )}

        {activeTab === 'timeline' && (
          <Card>
            <div className="space-y-3">
              {killmails.map((km: any) => (
                <div
                  key={km.killmail_id}
                  className="p-4 bg-gray-900/50 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-sm text-gray-500">
                        {formatDate(km.occurred_at)}
                      </div>
                      <div className="text-white">
                        {km.victim_name} lost a {km.ship_type_name}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-red-400 font-medium">
                        {formatISK(km.isk_value || 0)}
                      </div>
                      <a
                        href={getZKillURL(km.killmail_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-eve-blue"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className={color}>{icon}</div>
        <div>
          <p className="text-sm text-gray-400">{label}</p>
          <p className="text-xl font-bold text-white">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 font-medium transition-colors border-b-2 ${
        active
          ? 'border-eve-blue text-white'
          : 'border-transparent text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-gray-400 mb-1">{label}</dt>
      <dd className="text-base text-white">{value}</dd>
    </div>
  );
}
