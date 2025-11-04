import type { FC } from 'react';
import { EntityLink, type EntityType } from './EntityLink.js';

interface EntityListProps {
  type: EntityType;
  ids: readonly (string | null | undefined)[];
  names: readonly (string | null | undefined)[];
  showAvatars?: boolean;
  avatarSize?: number;
  maxDisplay?: number;
  separator?: string;
}

export const EntityList: FC<EntityListProps> = ({
  type,
  ids,
  names,
  showAvatars = false,
  avatarSize = 24,
  maxDisplay = 5,
  separator = ', ',
}) => {
  const validEntries = ids
    .map((id, index) => ({ id, name: names?.[index] }))
    .filter((entry) => entry.id);

  if (validEntries.length === 0) {
    return <span style={{ color: '#94a3b8' }}>—</span>;
  }

  const displayEntries = validEntries.slice(0, maxDisplay);
  const remaining = validEntries.length - displayEntries.length;

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}
    >
      {displayEntries.map((entry, index) => (
        <span key={entry.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
          <EntityLink
            type={type}
            id={entry.id}
            name={entry.name}
            showAvatar={showAvatars}
            avatarSize={avatarSize}
          />
          {index < displayEntries.length - 1 && separator}
        </span>
      ))}
      {remaining > 0 && (
        <span style={{ color: '#64748b', fontSize: '0.9em' }}>
          {separator}+{remaining} more
        </span>
      )}
    </span>
  );
};
