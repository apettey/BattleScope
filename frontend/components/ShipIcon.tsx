import Image from 'next/image';
import { getShipTypeImage } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface ShipIconProps {
  typeId: number;
  shipName: string;
  size?: number;
  className?: string;
  showName?: boolean;
}

export function ShipIcon({
  typeId,
  shipName,
  size = 64,
  className,
  showName = false,
}: ShipIconProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative flex-shrink-0">
        <Image
          src={getShipTypeImage(typeId, size)}
          alt={shipName}
          width={size}
          height={size}
          className="object-contain"
        />
      </div>
      {showName && (
        <span className="text-sm font-medium text-white truncate">
          {shipName}
        </span>
      )}
    </div>
  );
}
