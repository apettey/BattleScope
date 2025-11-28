'use client';

import { useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { CharacterAvatar } from '@/components/CharacterAvatar';
import { Badge } from '@/components/Badge';
import api from '@/lib/api';
import { useAuth } from '@/lib/store';
import { Star, Trash2, Plus } from 'lucide-react';
import type { Character } from '@/lib/types';

export default function CharactersPage() {
  const { user, setUser } = useAuth();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unlinkModal, setUnlinkModal] = useState<Character | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);

  useEffect(() => {
    fetchCharacters();
  }, []);

  const fetchCharacters = async () => {
    try {
      const response = await api.get('/api/me/characters');
      setCharacters(response.data.characters || []);
    } catch (error) {
      console.error('Failed to fetch characters:', error);
      setCharacters([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPrimary = async (characterId: string) => {
    try {
      await api.post('/api/me/characters/primary', { characterId });

      // Refetch user data to update UI
      const userResponse = await api.get('/api/me');
      setUser(userResponse.data);
      fetchCharacters();
    } catch (error) {
      console.error('Failed to set primary character:', error);
    }
  };

  const handleUnlink = async () => {
    if (!unlinkModal) return;

    setIsUnlinking(true);
    try {
      await api.delete(`/api/me/characters/${unlinkModal.id}`);

      // Refetch data
      const userResponse = await api.get('/api/me');
      setUser(userResponse.data);
      fetchCharacters();
      setUnlinkModal(null);
    } catch (error) {
      console.error('Failed to unlink character:', error);
    } finally {
      setIsUnlinking(false);
    }
  };

  const handleLinkCharacter = () => {
    window.location.href = '/api/me/characters/link';
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

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Characters</h1>
            <p className="text-gray-400 mt-1">
              Manage your EVE Online characters
            </p>
          </div>
          <Button onClick={handleLinkCharacter}>
            <Plus className="h-4 w-4 mr-2" />
            Link Character
          </Button>
        </div>

        <Card>
          {characters.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No characters linked</p>
              <Button onClick={handleLinkCharacter}>
                <Plus className="h-4 w-4 mr-2" />
                Link Your First Character
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {characters.map((character) => (
                <div
                  key={character.id}
                  className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <CharacterAvatar
                      characterId={character.character_id}
                      characterName={character.character_name}
                      size={64}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-white">
                          {character.character_name}
                        </h3>
                        {character.is_primary && (
                          <Badge variant="success">
                            <Star className="h-3 w-3 mr-1 inline" />
                            Primary
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-400">
                        {character.corp_name}
                      </p>
                      {character.alliance_name && (
                        <p className="text-xs text-gray-500">
                          {character.alliance_name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!character.is_primary && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSetPrimary(character.id)}
                      >
                        <Star className="h-4 w-4 mr-1" />
                        Set Primary
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setUnlinkModal(character)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Unlink Confirmation Modal */}
        <Modal
          isOpen={unlinkModal !== null}
          onClose={() => setUnlinkModal(null)}
          title="Unlink Character"
          footer={
            <>
              <Button variant="ghost" onClick={() => setUnlinkModal(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleUnlink}
                isLoading={isUnlinking}
              >
                Unlink
              </Button>
            </>
          }
        >
          <p className="text-gray-300">
            Are you sure you want to unlink{' '}
            <span className="font-semibold text-white">
              {unlinkModal?.character_name}
            </span>
            ? This action cannot be undone.
          </p>
          {unlinkModal?.is_primary && (
            <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700 rounded">
              <p className="text-sm text-yellow-400">
                This is your primary character. You'll need to set a new primary
                character after unlinking.
              </p>
            </div>
          )}
        </Modal>
      </div>
    </>
  );
}
