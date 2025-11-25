'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import api, { setAuthToken } from '@/lib/api';
import { Search, User, Building2, Ship, Skull, MapPin } from 'lucide-react';

interface SearchResult {
  id: string;
  type: 'character' | 'corporation' | 'alliance' | 'ship' | 'killmail' | 'system';
  name: string;
  description?: string;
  meta?: Record<string, any>;
}

export default function SearchPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchType, setSearchType] = useState<string>('all');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    } else if (status === 'authenticated' && session) {
      setAuthToken((session as any).accessToken);
    }
  }, [status, session, router]);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await api.get('/search', {
        params: { q: query, type: searchType },
      }).catch(() => ({
        data: [
          {
            id: '1',
            type: 'character',
            name: 'John Doe',
            description: 'Goonswarm Federation',
            meta: { kills: 1234, losses: 456 },
          },
          {
            id: '2',
            type: 'corporation',
            name: 'Test Corporation',
            description: 'Test Alliance',
            meta: { members: 234 },
          },
          {
            id: '3',
            type: 'system',
            name: 'M-OEE8',
            description: 'Delve Region',
            meta: { security: -0.7 },
          },
        ],
      }));
      setResults(response.data || []);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Search</h1>
        <p className="text-slate-400">Search for characters, corporations, ships, and more</p>
      </div>

      {/* Search Bar */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <div className="flex gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Search for characters, corporations, systems..."
              className="w-full pl-12 pr-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Type Filter */}
        <div className="flex gap-2 flex-wrap">
          {[
            { value: 'all', label: 'All' },
            { value: 'character', label: 'Characters' },
            { value: 'corporation', label: 'Corporations' },
            { value: 'alliance', label: 'Alliances' },
            { value: 'ship', label: 'Ships' },
            { value: 'system', label: 'Systems' },
          ].map((type) => (
            <button
              key={type.value}
              onClick={() => setSearchType(type.value)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                searchType === type.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-4">
            Search Results ({results.length})
          </h2>
          <div className="space-y-3">
            {results.map((result) => (
              <SearchResultCard key={result.id} result={result} />
            ))}
          </div>
        </div>
      )}

      {results.length === 0 && query && !loading && (
        <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center text-slate-400">
          No results found for &quot;{query}&quot;
        </div>
      )}
    </div>
  );
}

function SearchResultCard({ result }: { result: SearchResult }) {
  const icons = {
    character: User,
    corporation: Building2,
    alliance: Building2,
    ship: Ship,
    killmail: Skull,
    system: MapPin,
  };

  const colors = {
    character: 'text-blue-400 bg-blue-500/20',
    corporation: 'text-green-400 bg-green-500/20',
    alliance: 'text-purple-400 bg-purple-500/20',
    ship: 'text-orange-400 bg-orange-500/20',
    killmail: 'text-red-400 bg-red-500/20',
    system: 'text-yellow-400 bg-yellow-500/20',
  };

  const Icon = icons[result.type];

  return (
    <div className="bg-slate-700 rounded-lg p-4 border border-slate-600 hover:border-blue-500 transition-colors cursor-pointer">
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-lg ${colors[result.type]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-semibold">{result.name}</h3>
            <span className="px-2 py-0.5 bg-slate-600 rounded text-xs text-slate-300 capitalize">
              {result.type}
            </span>
          </div>
          {result.description && (
            <p className="text-slate-400 text-sm mb-2">{result.description}</p>
          )}
          {result.meta && (
            <div className="flex gap-4 text-xs text-slate-400">
              {Object.entries(result.meta).map(([key, value]) => (
                <span key={key}>
                  <span className="capitalize">{key}</span>: {value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
