import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
  padding?: boolean;
}

export function Card({ children, className, title, action, padding = true }: CardProps) {
  return (
    <div className={cn('bg-gray-900/50 border border-gray-800 rounded-lg', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={cn(padding && 'p-6')}>{children}</div>
    </div>
  );
}
