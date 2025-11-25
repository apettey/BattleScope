import Image from 'next/image';
import { getAllianceLogo } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface AllianceLogoProps {
  allianceId: number;
  allianceName: string;
  size?: number;
  className?: string;
  showName?: boolean;
}

export function AllianceLogo({
  allianceId,
  allianceName,
  size = 64,
  className,
  showName = false,
}: AllianceLogoProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative rounded overflow-hidden border border-gray-700 flex-shrink-0">
        <Image
          src={getAllianceLogo(allianceId, size)}
          alt={allianceName}
          width={size}
          height={size}
          className="object-cover"
        />
      </div>
      {showName && (
        <span className="text-sm font-medium text-white truncate">
          {allianceName}
        </span>
      )}
    </div>
  );
}
