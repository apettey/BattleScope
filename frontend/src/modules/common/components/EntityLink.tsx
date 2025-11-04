import type { FC, ReactNode } from 'react';

export type EntityType = 'alliance' | 'corporation' | 'character';

interface EntityLinkProps {
  type: EntityType;
  id: string | null | undefined;
  name: string | null | undefined;
  showAvatar?: boolean;
  avatarSize?: number;
  children?: ReactNode;
}

const getZkillboardUrl = (type: EntityType, id: string): string => {
  const baseUrl = 'https://zkillboard.com';
  return `${baseUrl}/${type}/${id}/`;
};

const getEveImageUrl = (type: EntityType, id: string, size: number): string => {
  const baseUrl = 'https://images.evetech.net';
  switch (type) {
    case 'alliance':
      return `${baseUrl}/alliances/${id}/logo?size=${size}`;
    case 'corporation':
      return `${baseUrl}/corporations/${id}/logo?size=${size}`;
    case 'character':
      return `${baseUrl}/characters/${id}/portrait?size=${size}`;
  }
};

const getEntityTypeLabel = (type: EntityType): string => {
  switch (type) {
    case 'alliance':
      return 'Alliance';
    case 'corporation':
      return 'Corporation';
    case 'character':
      return 'Character';
  }
};

export const EntityLink: FC<EntityLinkProps> = ({
  type,
  id,
  name,
  showAvatar = false,
  avatarSize = 32,
  children,
}) => {
  if (!id) {
    return <span style={{ color: '#94a3b8' }}>—</span>;
  }

  const displayName = name || `Unknown ${getEntityTypeLabel(type)} #${id}`;
  const zkbUrl = getZkillboardUrl(type, id);
  const imageUrl = showAvatar ? getEveImageUrl(type, id, avatarSize) : null;

  return (
    <a
      href={zkbUrl}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        color: '#0ea5e9',
        textDecoration: 'none',
        transition: 'color 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = '#0284c7';
        e.currentTarget.style.textDecoration = 'underline';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = '#0ea5e9';
        e.currentTarget.style.textDecoration = 'none';
      }}
      title={`View ${displayName} on zKillboard`}
    >
      {showAvatar && imageUrl && (
        <img
          src={imageUrl}
          alt={`${displayName} avatar`}
          style={{
            width: `${avatarSize}px`,
            height: `${avatarSize}px`,
            borderRadius: type === 'character' ? '50%' : '4px',
            objectFit: 'cover',
            background: '#1e293b',
          }}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
      {children || displayName}
    </a>
  );
};
