import Image from 'next/image';
import { getCorpLogo } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface CorpLogoProps {
  corpId: number;
  corpName: string;
  size?: number;
  className?: string;
  showName?: boolean;
}

export function CorpLogo({
  corpId,
  corpName,
  size = 64,
  className,
  showName = false,
}: CorpLogoProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative rounded overflow-hidden border border-gray-700 flex-shrink-0">
        <Image
          src={getCorpLogo(corpId, size)}
          alt={corpName}
          width={size}
          height={size}
          className="object-cover"
        />
      </div>
      {showName && (
        <span className="text-sm font-medium text-white truncate">
          {corpName}
        </span>
      )}
    </div>
  );
}
