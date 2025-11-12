import { useCallback, useEffect, useRef, useState } from 'react';
import type { EntitySearchResult, EntityType } from '@battlescope/search';
import { resolveBaseUrl } from '../../api/http.js';
import { EntityLink } from './EntityLink.js';

export interface EntityAutocompleteProps {
  /** Entity types to search for (defaults to all) */
  types?: EntityType[];
  /** Placeholder text */
  placeholder?: string;
  /** Current selected entity */
  value?: EntitySearchResult | null;
  /** Callback when entity is selected */
  onChange: (entity: EntitySearchResult | null) => void;
  /** Optional label */
  label?: string;
  /** Optional error message */
  error?: string;
}

interface AutocompleteResponse {
  alliances: EntitySearchResult[];
  corporations: EntitySearchResult[];
  characters: EntitySearchResult[];
  processingTimeMs: number;
  query: string;
}

const fetchEntityAutocomplete = async (
  query: string,
  types?: EntityType[],
  signal?: AbortSignal,
): Promise<AutocompleteResponse> => {
  const baseUrl = resolveBaseUrl();
  const params = new URLSearchParams({ q: query });
  if (types && types.length > 0) {
    params.append('type', types.join(','));
  }

  const response = await fetch(`${baseUrl}/search/entities?${params}`, {
    signal,
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`);
  }
  return response.json();
};

const getEntityLogoUrl = (entity: EntitySearchResult): string | null => {
  const size = 64;
  switch (entity.type) {
    case 'alliance':
      return `https://images.evetech.net/alliances/${entity.id}/logo?size=${size}`;
    case 'corporation':
      return `https://images.evetech.net/corporations/${entity.id}/logo?size=${size}`;
    case 'character':
      return `https://images.evetech.net/characters/${entity.id}/portrait?size=${size}`;
    default:
      return null;
  }
};

export const EntityAutocomplete = ({
  types,
  placeholder = 'Search for alliance, corporation, or character...',
  value,
  onChange,
  label,
  error,
}: EntityAutocompleteProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    // Cancel previous request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);

    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetchEntityAutocomplete(query, types, controller.signal);
          if (controller.signal.aborted) {
            return;
          }

          // Flatten results maintaining type grouping
          const allResults: EntitySearchResult[] = [
            ...response.alliances,
            ...response.corporations,
            ...response.characters,
          ];

          setResults(allResults);
          setIsOpen(allResults.length > 0);
          setFocusedIndex(-1);
        } catch (err) {
          if (!controller.signal.aborted) {
            console.error('Autocomplete search failed:', err);
            setResults([]);
          }
        } finally {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        }
      })();
    }, 300); // 300ms debounce

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, types]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (entity: EntitySearchResult) => {
      onChange(entity);
      setQuery('');
      setIsOpen(false);
      setResults([]);
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    onChange(null);
    setQuery('');
    setResults([]);
    setIsOpen(false);
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && focusedIndex >= 0 && results[focusedIndex]) {
        e.preventDefault();
        handleSelect(results[focusedIndex]);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    },
    [focusedIndex, results, handleSelect],
  );

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {label && (
        <label
          htmlFor="entity-autocomplete"
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#0f172a',
          }}
        >
          {label}
        </label>
      )}

      <div style={{ position: 'relative' }}>
        {value ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.75rem',
              border: '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              background: '#f8fafc',
            }}
          >
            <EntityLink
              type={value.type}
              id={value.id}
              name={value.name}
              showAvatar={true}
              avatarSize={20}
            />
            {value.ticker && (
              <span style={{ color: '#64748b', fontSize: '0.875rem' }}>[{value.ticker}]</span>
            )}
            <button
              type="button"
              onClick={handleClear}
              style={{
                marginLeft: 'auto',
                padding: '0.25rem 0.5rem',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: '#64748b',
              }}
            >
              ✕ Clear
            </button>
          </div>
        ) : (
          <input
            ref={inputRef}
            id="entity-autocomplete"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (results.length > 0) {
                setIsOpen(true);
              }
            }}
            placeholder={placeholder}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: error ? '1px solid #dc2626' : '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
          />
        )}

        {isLoading && (
          <div
            style={{
              position: 'absolute',
              right: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#64748b',
              fontSize: '0.875rem',
            }}
          >
            Loading...
          </div>
        )}
      </div>

      {error && (
        <p
          style={{
            marginTop: '0.25rem',
            fontSize: '0.8125rem',
            color: '#dc2626',
          }}
        >
          {error}
        </p>
      )}

      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '0.25rem',
            background: '#fff',
            border: '1px solid #cbd5e1',
            borderRadius: '0.5rem',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            maxHeight: '300px',
            overflowY: 'auto',
            zIndex: 50,
          }}
        >
          <ul style={{ listStyle: 'none', padding: '0.25rem', margin: 0 }}>
            {results.map((entity, index) => {
              const logoUrl = getEntityLogoUrl(entity);
              return (
                <li key={`${entity.type}-${entity.id}`}>
                  <button
                    type="button"
                    onClick={() => handleSelect(entity)}
                    onMouseEnter={() => setFocusedIndex(index)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.5rem 0.75rem',
                      border: 'none',
                      borderRadius: '0.375rem',
                      background: focusedIndex === index ? '#f1f5f9' : 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      fontSize: '0.875rem',
                      transition: 'background-color 0.15s',
                    }}
                  >
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt={`${entity.name} logo`}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: entity.type === 'character' ? '50%' : '4px',
                          objectFit: 'cover',
                          flexShrink: 0,
                          background: '#f1f5f9',
                        }}
                      />
                    ) : null}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 500,
                          color: '#0f172a',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {entity.name}
                        {entity.ticker && (
                          <span style={{ color: '#64748b', marginLeft: '0.25rem' }}>
                            [{entity.ticker}]
                          </span>
                        )}
                      </div>
                      {(entity.allianceName || entity.corpName) && (
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: '#64748b',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {entity.type === 'character' && entity.corpName && (
                            <>
                              {entity.corpName}
                              {entity.allianceName && ` • ${entity.allianceName}`}
                            </>
                          )}
                          {entity.type === 'corporation' && entity.allianceName && (
                            <>{entity.allianceName}</>
                          )}
                        </div>
                      )}
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                      {entity.battleCount} battles
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
