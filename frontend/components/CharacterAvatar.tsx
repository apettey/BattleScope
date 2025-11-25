import Image from 'next/image';
import { getCharacterPortrait } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface CharacterAvatarProps {
  characterId: number;
  characterName: string;
  size?: number;
  className?: string;
  showName?: boolean;
}

export function CharacterAvatar({
  characterId,
  characterName,
  size = 64,
  className,
  showName = false,
}: CharacterAvatarProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="relative rounded-full overflow-hidden border-2 border-gray-700 flex-shrink-0">
        <Image
          src={getCharacterPortrait(characterId, size)}
          alt={characterName}
          width={size}
          height={size}
          className="object-cover"
        />
      </div>
      {showName && (
        <span className="text-sm font-medium text-white truncate">
          {characterName}
        </span>
      )}
    </div>
  );
}
