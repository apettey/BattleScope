import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';

// Utility for combining class names with Tailwind merge
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format ISK value to human-readable format
export function formatISK(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  }
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  return value.toFixed(0);
}

// Format date/time
export function formatDate(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy HH:mm');
}

// Format relative time
export function formatRelativeTime(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

// Get security status color
export function getSecurityColor(security: number): string {
  if (security >= 0.5) return 'text-green-400';
  if (security > 0.0) return 'text-yellow-400';
  return 'text-red-400';
}

// Get security status label
export function getSecurityLabel(security: number): string {
  if (security >= 0.5) return 'High-Sec';
  if (security > 0.0) return 'Low-Sec';
  if (security === 0.0) return 'Null-Sec';
  return 'W-Space';
}

// Format number with commas
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

// Get EVE character portrait URL
export function getCharacterPortrait(characterId: number, size: number = 128): string {
  return `https://images.evetech.net/characters/${characterId}/portrait?size=${size}`;
}

// Get EVE corporation logo URL
export function getCorpLogo(corpId: number, size: number = 128): string {
  return `https://images.evetech.net/corporations/${corpId}/logo?size=${size}`;
}

// Get EVE alliance logo URL
export function getAllianceLogo(allianceId: number, size: number = 128): string {
  return `https://images.evetech.net/alliances/${allianceId}/logo?size=${size}`;
}

// Get EVE ship type image URL
export function getShipTypeImage(typeId: number, size: number = 64): string {
  return `https://images.evetech.net/types/${typeId}/render?size=${size}`;
}

// Get zKillboard killmail URL
export function getZKillURL(killmailId: number): string {
  return `https://zkillboard.com/kill/${killmailId}/`;
}

// Get dotlan system URL
export function getDotlanSystemURL(systemName: string): string {
  return `https://evemaps.dotlan.net/system/${systemName.replace(' ', '_')}`;
}

// Truncate text
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
