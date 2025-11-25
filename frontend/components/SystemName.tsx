import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { getSecurityColor, getSecurityLabel, getDotlanSystemURL } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface SystemNameProps {
  systemName: string;
  securityStatus?: number;
  regionName?: string;
  showExternal?: boolean;
  className?: string;
}

export function SystemName({
  systemName,
  securityStatus,
  regionName,
  showExternal = false,
  className,
}: SystemNameProps) {
  const secColor = securityStatus !== undefined ? getSecurityColor(securityStatus) : '';
  const secLabel = securityStatus !== undefined ? getSecurityLabel(securityStatus) : '';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div>
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-white">{systemName}</span>
          {showExternal && (
            <a
              href={getDotlanSystemURL(systemName)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-eve-blue transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        {(securityStatus !== undefined || regionName) && (
          <div className="flex items-center gap-2 text-xs">
            {securityStatus !== undefined && (
              <span className={secColor}>
                {secLabel} ({securityStatus.toFixed(1)})
              </span>
            )}
            {regionName && <span className="text-gray-500">{regionName}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
