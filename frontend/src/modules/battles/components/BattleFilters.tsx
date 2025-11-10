import { useState } from 'react';
import type { EntitySearchResult } from '@battlescope/search';
import { EntityAutocomplete } from '../../common/components/EntityAutocomplete.js';

export interface BattleFilterValues {
  securityType?: 'highsec' | 'lowsec' | 'nullsec' | 'wormhole' | 'pochven';
  allianceId?: string;
  allianceName?: string;
  corpId?: string;
  corpName?: string;
  characterId?: string;
  characterName?: string;
  since?: Date;
  until?: Date;
}

export interface BattleFiltersProps {
  /** Current filter values */
  values: BattleFilterValues;
  /** Callback when filters change */
  onChange: (values: BattleFilterValues) => void;
  /** Callback when filters are applied */
  onApply: () => void;
  /** Whether filters are currently being applied */
  isApplying?: boolean;
}

const securityTypeOptions = [
  { value: 'highsec', label: '🛡️ High Sec', color: '#10b981' },
  { value: 'lowsec', label: '⚠️ Low Sec', color: '#f59e0b' },
  { value: 'nullsec', label: '💀 Null Sec', color: '#ef4444' },
  { value: 'wormhole', label: '🕳️ Wormhole', color: '#8b5cf6' },
  { value: 'pochven', label: '⚡ Pochven', color: '#ec4899' },
] as const;

export const BattleFilters = ({ values, onChange, onApply, isApplying }: BattleFiltersProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSecurityTypeChange = (
    securityType: 'highsec' | 'lowsec' | 'nullsec' | 'wormhole' | 'pochven',
  ) => {
    onChange({
      ...values,
      securityType: values.securityType === securityType ? undefined : securityType,
    });
  };

  const handleAllianceChange = (entity: EntitySearchResult | null) => {
    onChange({
      ...values,
      allianceId: entity?.id,
      allianceName: entity?.name,
    });
  };

  const handleCorpChange = (entity: EntitySearchResult | null) => {
    onChange({
      ...values,
      corpId: entity?.id,
      corpName: entity?.name,
    });
  };

  const handleCharacterChange = (entity: EntitySearchResult | null) => {
    onChange({
      ...values,
      characterId: entity?.id,
      characterName: entity?.name,
    });
  };

  const handleDateChange = (type: 'since' | 'until', value: string) => {
    onChange({
      ...values,
      [type]: value ? new Date(value) : undefined,
    });
  };

  const handleClearAll = () => {
    onChange({});
    onApply();
  };

  const activeFilterCount = [
    values.securityType,
    values.allianceId,
    values.corpId,
    values.characterId,
    values.since,
    values.until,
  ].filter(Boolean).length;

  const allianceValue = values.allianceId
    ? {
        id: values.allianceId,
        type: 'alliance' as const,
        name: values.allianceName || '',
        ticker: null,
        battleCount: 0,
        lastSeenAt: new Date().toISOString(),
      }
    : null;

  const corpValue = values.corpId
    ? {
        id: values.corpId,
        type: 'corporation' as const,
        name: values.corpName || '',
        ticker: null,
        battleCount: 0,
        lastSeenAt: new Date().toISOString(),
      }
    : null;

  const characterValue = values.characterId
    ? {
        id: values.characterId,
        type: 'character' as const,
        name: values.characterName || '',
        ticker: null,
        battleCount: 0,
        lastSeenAt: new Date().toISOString(),
      }
    : null;

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '0.75rem',
        padding: '1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            background: isExpanded ? '#f1f5f9' : '#fff',
            border: '1px solid #cbd5e1',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#0f172a',
            transition: 'all 0.2s',
          }}
        >
          <span
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          >
            ▶
          </span>
          <span>🔍 Filters</span>
          {activeFilterCount > 0 && (
            <span
              style={{
                background: '#0ea5e9',
                color: '#fff',
                padding: '0.125rem 0.375rem',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            style={{
              padding: '0.5rem 0.75rem',
              background: '#fff',
              border: '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: '#64748b',
              transition: 'all 0.2s',
            }}
          >
            ✕ Clear all
          </button>
        )}

        <button
          type="button"
          onClick={onApply}
          disabled={isApplying}
          style={{
            marginLeft: 'auto',
            padding: '0.5rem 1rem',
            background: isApplying ? '#cbd5e1' : '#0ea5e9',
            color: '#fff',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: isApplying ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
            transition: 'all 0.2s',
          }}
        >
          {isApplying ? 'Applying...' : 'Apply Filters'}
        </button>
      </div>

      {isExpanded && (
        <div
          style={{
            display: 'grid',
            gap: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid #e2e8f0',
          }}
        >
          {/* Security Type Filter */}
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Security Type
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {securityTypeOptions.map((option) => {
                const isSelected = values.securityType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSecurityTypeChange(option.value)}
                    style={{
                      padding: '0.5rem 1rem',
                      border: isSelected ? `2px solid ${option.color}` : '1px solid #cbd5e1',
                      borderRadius: '0.5rem',
                      background: isSelected ? `${option.color}15` : '#fff',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: isSelected ? 500 : 400,
                      color: isSelected ? option.color : '#64748b',
                      transition: 'all 0.2s',
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Alliance Filter */}
          <EntityAutocomplete
            types={['alliance']}
            label="Alliance"
            placeholder="Search for an alliance..."
            value={allianceValue}
            onChange={handleAllianceChange}
          />

          {/* Corporation Filter */}
          <EntityAutocomplete
            types={['corporation']}
            label="Corporation"
            placeholder="Search for a corporation..."
            value={corpValue}
            onChange={handleCorpChange}
          />

          {/* Character Filter */}
          <EntityAutocomplete
            types={['character']}
            label="Character"
            placeholder="Search for a character..."
            value={characterValue}
            onChange={handleCharacterChange}
          />

          {/* Date Range Filter */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label
                htmlFor="filter-since"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                From Date
              </label>
              <input
                id="filter-since"
                type="datetime-local"
                value={values.since ? values.since.toISOString().slice(0, 16) : ''}
                onChange={(e) => handleDateChange('since', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                }}
              />
            </div>
            <div>
              <label
                htmlFor="filter-until"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                To Date
              </label>
              <input
                id="filter-until"
                type="datetime-local"
                value={values.until ? values.until.toISOString().slice(0, 16) : ''}
                onChange={(e) => handleDateChange('until', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>

          {/* Active Filters Summary */}
          {activeFilterCount > 0 && (
            <div
              style={{
                padding: '0.75rem',
                background: '#f8fafc',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: '0.5rem', color: '#0f172a' }}>
                Active Filters ({activeFilterCount}):
              </div>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                {values.securityType && (
                  <li
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: '#e0f2fe',
                      borderRadius: '0.25rem',
                      fontSize: '0.8125rem',
                      color: '#0369a1',
                    }}
                  >
                    Security:{' '}
                    {securityTypeOptions.find((o) => o.value === values.securityType)?.label}
                  </li>
                )}
                {values.allianceName && (
                  <li
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: '#e0f2fe',
                      borderRadius: '0.25rem',
                      fontSize: '0.8125rem',
                      color: '#0369a1',
                    }}
                  >
                    Alliance: {values.allianceName}
                  </li>
                )}
                {values.corpName && (
                  <li
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: '#e0f2fe',
                      borderRadius: '0.25rem',
                      fontSize: '0.8125rem',
                      color: '#0369a1',
                    }}
                  >
                    Corp: {values.corpName}
                  </li>
                )}
                {values.characterName && (
                  <li
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: '#e0f2fe',
                      borderRadius: '0.25rem',
                      fontSize: '0.8125rem',
                      color: '#0369a1',
                    }}
                  >
                    Character: {values.characterName}
                  </li>
                )}
                {values.since && (
                  <li
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: '#e0f2fe',
                      borderRadius: '0.25rem',
                      fontSize: '0.8125rem',
                      color: '#0369a1',
                    }}
                  >
                    From: {values.since.toLocaleDateString()}
                  </li>
                )}
                {values.until && (
                  <li
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: '#e0f2fe',
                      borderRadius: '0.25rem',
                      fontSize: '0.8125rem',
                      color: '#0369a1',
                    }}
                  >
                    To: {values.until.toLocaleDateString()}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
