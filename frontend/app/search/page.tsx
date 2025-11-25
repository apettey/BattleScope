'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Badge } from '@/components/Badge';
import { CharacterAvatar } from '@/components/CharacterAvatar';
import api from '@/lib/api';
import { Search as SearchIcon, Filter } from 'lucide-react';
import type { SearchResult } from '@/lib/types';

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams?.get('q') || '');
  const [typeFilter, setTypeFilter] = useState(searchParams?.get('type') || 'all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!query.trim()) return;

    setIsLoading(true);
    try {
      const params: any = { q: query };
      if (typeFilter !== 'all') params.type = typeFilter;

      const response = await api.get('/api/search', { params });
      setResults(response.data.results || response.data);

      // Update URL
      router.push(`/search?q=${encodeURIComponent(query)}&type=${typeFilter}`);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      battle: 'info',
      character: 'success',
      corporation: 'warning',
      system: 'default',
    };
    return colors[type] || 'default';
  };

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Search</h1>
          <p className="text-gray-400 mt-1">
            Search for battles, characters, corporations, and systems
          </p>
        </div>

        {/* Search Form */}
        <Card className="mb-6">
          <form onSubmit={handleSearch}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <Input
                  placeholder="Enter search term..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-eve-blue"
                >
                  <option value="all">All Types</option>
                  <option value="battle">Battles</option>
                  <option value="character">Characters</option>
                  <option value="corporation">Corporations</option>
                  <option value="system">Systems</option>
                </select>
              </div>
              <div>
                <Button type="submit" fullWidth isLoading={isLoading}>
                  <SearchIcon className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>
            </div>
          </form>
        </Card>

        {/* Results */}
        {isLoading ? (
          <Card>
            <LoadingSpinner />
          </Card>
        ) : results.length > 0 ? (
          <Card>
            <div className="space-y-3">
              {results.map((result) => (
                <div
                  key={result.id}
                  className="p-4 bg-gray-900/50 rounded-lg hover:bg-gray-900 transition-colors cursor-pointer"
                  onClick={() => {
                    if (result.type === 'battle') {
                      router.push(`/battles/${result.id}`);
                    }
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant={getTypeColor(result.type) as any}>
                          {result.type}
                        </Badge>
                        <h3 className="text-lg font-semibold text-white">
                          {result.name}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-400">
                        {result.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : query ? (
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-500">No results found for "{query}"</p>
              <p className="text-sm text-gray-600 mt-2">
                Try different search terms or filters
              </p>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
