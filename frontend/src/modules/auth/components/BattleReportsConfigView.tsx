/**
 * Battle Reports Configuration Panel for SuperAdmin
 * Allows configuration of ingestion filters and clustering settings
 */

import React, { useState, useEffect } from 'react';
import { useApiCall } from '../../api/useApiCall.js';
import { resolveBaseUrl } from '../../api/http.js';

interface IngestionConfig {
  ruleset: {
    id: string;
    minPilots: number;
    trackedAllianceIds: string[];
    trackedCorpIds: string[];
    trackedSystemIds: string[];
    trackedSecurityTypes: string[];
    ignoreUnlisted: boolean;
    updatedAt: string;
  };
  service: {
    pollIntervalMs?: number;
    redisqQueueId?: string;
  };
}

interface ClusteringConfig {
  windowMinutes?: number;
  gapMaxMinutes?: number;
  minKills?: number;
  processingDelayMinutes?: number;
  batchSize?: number;
  intervalMs?: number;
}

interface IngestionStats {
  received24h: number;
  accepted24h: number;
  rejected24h: number;
  acceptanceRate: number;
  unprocessedCount: number;
}

interface ClusteringStats {
  battlesCreated24h: number;
  unprocessedKillmails: number;
  averageLagMinutes: number;
  lastProcessedAt: string | null;
}

export const BattleReportsConfigView: React.FC = () => {
  const { wrapApiCall } = useApiCall();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [ingestionConfig, setIngestionConfig] = useState<IngestionConfig | null>(null);
  const [clusteringConfig, setClusteringConfig] = useState<ClusteringConfig | null>(null);
  const [ingestionStats, setIngestionStats] = useState<IngestionStats | null>(null);
  const [clusteringStats, setClusteringStats] = useState<ClusteringStats | null>(null);

  // Form state
  const [minPilots, setMinPilots] = useState(0);
  const [securityTypes, setSecurityTypes] = useState<string[]>([]);
  const [trackedAllianceIds, setTrackedAllianceIds] = useState<string[]>([]);
  const [trackedCorpIds, setTrackedCorpIds] = useState<string[]>([]);
  const [ignoreUnlisted, setIgnoreUnlisted] = useState(false);
  const [windowMinutes, setWindowMinutes] = useState<number | undefined>(undefined);
  const [gapMaxMinutes, setGapMaxMinutes] = useState<number | undefined>(undefined);
  const [minKills, setMinKills] = useState<number | undefined>(undefined);

  // Entity input state
  const [allianceInput, setAllianceInput] = useState('');
  const [corpInput, setCorpInput] = useState('');

  // Autocomplete state
  const [allianceSearchResults, setAllianceSearchResults] = useState<Array<{id: string; name: string; ticker: string | null}>>([]);
  const [corpSearchResults, setCorpSearchResults] = useState<Array<{id: string; name: string; ticker: string | null}>>([]);
  const [showAllianceDropdown, setShowAllianceDropdown] = useState(false);
  const [showCorpDropdown, setShowCorpDropdown] = useState(false);

  // Entity name mappings (for displaying tracked entities)
  const [allianceNames, setAllianceNames] = useState<Map<string, {name: string; ticker: string | null}>>(new Map());
  const [corpNames, setCorpNames] = useState<Map<string, {name: string; ticker: string | null}>>(new Map());

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const baseUrl = resolveBaseUrl();

      // Load all config and stats in parallel
      const [ingestCfg, clusterCfg, ingestSts, clusterSts] = await Promise.all([
        wrapApiCall(() =>
          fetch(`${baseUrl}/admin/config/ingest`, { credentials: 'include' }).then((r) => {
            if (!r.ok) throw new Error(`Failed to load ingestion config: ${r.statusText}`);
            return r.json() as Promise<IngestionConfig>;
          }),
        ),
        wrapApiCall(() =>
          fetch(`${baseUrl}/admin/config/clusterer`, { credentials: 'include' }).then((r) => {
            if (!r.ok) throw new Error(`Failed to load clustering config: ${r.statusText}`);
            return r.json() as Promise<ClusteringConfig>;
          }),
        ),
        wrapApiCall(() =>
          fetch(`${baseUrl}/admin/stats/ingest`, { credentials: 'include' }).then((r) => {
            if (!r.ok) throw new Error(`Failed to load ingestion stats: ${r.statusText}`);
            return r.json() as Promise<IngestionStats>;
          }),
        ),
        wrapApiCall(() =>
          fetch(`${baseUrl}/admin/stats/clusterer`, { credentials: 'include' }).then((r) => {
            if (!r.ok) throw new Error(`Failed to load clustering stats: ${r.statusText}`);
            return r.json() as Promise<ClusteringStats>;
          }),
        ),
      ]);

      setIngestionConfig(ingestCfg);
      setClusteringConfig(clusterCfg);
      setIngestionStats(ingestSts);
      setClusteringStats(clusterSts);

      // Initialize form state
      setMinPilots(ingestCfg.ruleset.minPilots);
      setSecurityTypes(ingestCfg.ruleset.trackedSecurityTypes);
      setTrackedAllianceIds(ingestCfg.ruleset.trackedAllianceIds);
      setTrackedCorpIds(ingestCfg.ruleset.trackedCorpIds);
      setIgnoreUnlisted(ingestCfg.ruleset.ignoreUnlisted);
      setWindowMinutes(clusterCfg.windowMinutes);
      setGapMaxMinutes(clusterCfg.gapMaxMinutes);
      setMinKills(clusterCfg.minKills);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Debounced search for alliances
  useEffect(() => {
    if (allianceInput.length < 2) {
      setAllianceSearchResults([]);
      setShowAllianceDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const baseUrl = resolveBaseUrl();
        const response = await fetch(
          `${baseUrl}/search/entities?q=${encodeURIComponent(allianceInput)}&type=alliance&limit=10`,
          { credentials: 'include' }
        );
        if (response.ok) {
          const data = await response.json();
          setAllianceSearchResults(data.alliances || []);
          setShowAllianceDropdown(true);
        }
      } catch (err) {
        console.error('Alliance search failed:', err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [allianceInput]);

  // Debounced search for corporations
  useEffect(() => {
    if (corpInput.length < 2) {
      setCorpSearchResults([]);
      setShowCorpDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const baseUrl = resolveBaseUrl();
        const response = await fetch(
          `${baseUrl}/search/entities?q=${encodeURIComponent(corpInput)}&type=corporation&limit=10`,
          { credentials: 'include' }
        );
        if (response.ok) {
          const data = await response.json();
          setCorpSearchResults(data.corporations || []);
          setShowCorpDropdown(true);
        }
      } catch (err) {
        console.error('Corporation search failed:', err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [corpInput]);

  const addAlliance = (id: string, name: string, ticker: string | null) => {
    if (!trackedAllianceIds.includes(id)) {
      setTrackedAllianceIds([...trackedAllianceIds, id]);
      setAllianceNames(new Map(allianceNames).set(id, { name, ticker }));
    }
    setAllianceInput('');
    setShowAllianceDropdown(false);
  };

  const addCorporation = (id: string, name: string, ticker: string | null) => {
    if (!trackedCorpIds.includes(id)) {
      setTrackedCorpIds([...trackedCorpIds, id]);
      setCorpNames(new Map(corpNames).set(id, { name, ticker }));
    }
    setCorpInput('');
    setShowCorpDropdown(false);
  };

  const removeAlliance = (id: string) => {
    setTrackedAllianceIds(trackedAllianceIds.filter((aid) => aid !== id));
  };

  const removeCorporation = (id: string) => {
    setTrackedCorpIds(trackedCorpIds.filter((cid) => cid !== id));
  };

  const handleSaveIngestion = async () => {
    if (!ingestionConfig) return;

    setSaving(true);
    try {
      const baseUrl = resolveBaseUrl();
      await wrapApiCall(() =>
        fetch(`${baseUrl}/admin/config/ingest`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ruleset: {
              minPilots,
              trackedAllianceIds: trackedAllianceIds,
              trackedCorpIds: trackedCorpIds,
              trackedSecurityTypes: securityTypes,
              ignoreUnlisted,
            },
          }),
        }).then((r) => {
          if (!r.ok) throw new Error(`Failed to save: ${r.statusText}`);
          return r.json();
        }),
      );
      alert('Ingestion configuration saved successfully');
      await loadData();
    } catch (err) {
      alert(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClustering = async () => {
    setSaving(true);
    try {
      const baseUrl = resolveBaseUrl();
      await wrapApiCall(() =>
        fetch(`${baseUrl}/admin/config/clusterer`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            windowMinutes,
            gapMaxMinutes,
            minKills,
          }),
        }).then((r) => {
          if (!r.ok) throw new Error(`Failed to save: ${r.statusText}`);
          return r.json();
        }),
      );
      alert('Clustering configuration saved successfully');
      await loadData();
    } catch (err) {
      alert(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleSecurityType = (type: string) => {
    if (securityTypes.includes(type)) {
      setSecurityTypes(securityTypes.filter((t) => t !== type));
    } else {
      setSecurityTypes([...securityTypes, type]);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
        Loading configuration...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '16px',
          backgroundColor: '#fef2f2',
          color: '#dc2626',
          borderRadius: '6px',
          marginBottom: '16px',
        }}
      >
        Error: {error}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>
        Battle Reports Configuration
      </h1>
      <p style={{ color: '#64748b', marginBottom: '32px' }}>
        Configure ingestion filters and clustering settings for battle report generation
      </p>

      {/* Statistics Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {ingestionStats && (
          <>
            <div
              style={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
                Killmails (24h)
              </div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#0f172a' }}>
                {ingestionStats.received24h.toLocaleString()}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                {ingestionStats.acceptanceRate.toFixed(1)}% acceptance rate
              </div>
            </div>
            <div
              style={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
                Unprocessed Queue
              </div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b' }}>
                {ingestionStats.unprocessedCount.toLocaleString()}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                awaiting clustering
              </div>
            </div>
          </>
        )}
        {clusteringStats && (
          <>
            <div
              style={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
                Battles Created (24h)
              </div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#10b981' }}>
                {clusteringStats.battlesCreated24h.toLocaleString()}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                {clusteringStats.averageLagMinutes}min avg lag
              </div>
            </div>
            <div
              style={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
                Last Processed
              </div>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', marginTop: '8px' }}>
                {clusteringStats.lastProcessedAt
                  ? new Date(clusteringStats.lastProcessedAt).toLocaleString()
                  : 'Never'}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Ingestion Configuration */}
      <div
        style={{
          backgroundColor: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
        }}
      >
        <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>
          Ingestion Filters
        </h2>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#0f172a', marginBottom: '8px' }}>
            Minimum Pilots per Killmail
          </label>
          <input
            type="number"
            value={minPilots}
            onChange={(e) => setMinPilots(parseInt(e.target.value) || 0)}
            min={0}
            max={1000}
            style={{
              width: '200px',
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
            }}
          />
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Killmails with fewer pilots will be rejected
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#0f172a', marginBottom: '8px' }}>
            Tracked Security Types
          </label>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {['highsec', 'lowsec', 'nullsec', 'wormhole', 'pochven'].map((type) => (
              <button
                key={type}
                onClick={() => toggleSecurityType(type)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: securityTypes.includes(type) ? '#0ea5e9' : '#f1f5f9',
                  color: securityTypes.includes(type) ? 'white' : '#475569',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  textTransform: 'capitalize',
                }}
              >
                {type}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Only killmails from selected security types will be ingested
          </div>
        </div>

        <div style={{ marginBottom: '20px', position: 'relative' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#0f172a', marginBottom: '8px' }}>
            Tracked Alliances
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={allianceInput}
              onChange={(e) => setAllianceInput(e.target.value)}
              onFocus={() => allianceInput.length >= 2 && setShowAllianceDropdown(true)}
              onBlur={() => setTimeout(() => setShowAllianceDropdown(false), 200)}
              placeholder="Search for alliance by name..."
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
              }}
            />
            {showAllianceDropdown && allianceSearchResults.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  marginTop: '4px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  zIndex: 1000,
                }}
              >
                {allianceSearchResults.map((alliance) => (
                  <div
                    key={alliance.id}
                    onClick={() => addAlliance(alliance.id, alliance.name, alliance.ticker)}
                    style={{
                      padding: '12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                  >
                    <div style={{ fontWeight: '500', color: '#0f172a' }}>{alliance.name}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {alliance.ticker ? `[${alliance.ticker}]` : ''} ID: {alliance.id}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {trackedAllianceIds.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {trackedAllianceIds.map((id) => {
                const info = allianceNames.get(id);
                return (
                  <span
                    key={id}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#f1f5f9',
                      color: '#0f172a',
                      borderRadius: '6px',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    {info ? `${info.name} ${info.ticker ? `[${info.ticker}]` : ''}` : id}
                    <button
                      onClick={() => removeAlliance(id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: '0',
                        fontSize: '16px',
                        lineHeight: '1',
                      }}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Only killmails involving these alliances will be ingested (if Ignore Unlisted is enabled)
          </div>
        </div>

        <div style={{ marginBottom: '20px', position: 'relative' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#0f172a', marginBottom: '8px' }}>
            Tracked Corporations
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={corpInput}
              onChange={(e) => setCorpInput(e.target.value)}
              onFocus={() => corpInput.length >= 2 && setShowCorpDropdown(true)}
              onBlur={() => setTimeout(() => setShowCorpDropdown(false), 200)}
              placeholder="Search for corporation by name..."
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
              }}
            />
            {showCorpDropdown && corpSearchResults.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  marginTop: '4px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  zIndex: 1000,
                }}
              >
                {corpSearchResults.map((corp) => (
                  <div
                    key={corp.id}
                    onClick={() => addCorporation(corp.id, corp.name, corp.ticker)}
                    style={{
                      padding: '12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                  >
                    <div style={{ fontWeight: '500', color: '#0f172a' }}>{corp.name}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {corp.ticker ? `[${corp.ticker}]` : ''} ID: {corp.id}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {trackedCorpIds.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {trackedCorpIds.map((id) => {
                const info = corpNames.get(id);
                return (
                  <span
                    key={id}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#f1f5f9',
                      color: '#0f172a',
                      borderRadius: '6px',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    {info ? `${info.name} ${info.ticker ? `[${info.ticker}]` : ''}` : id}
                    <button
                      onClick={() => removeCorporation(id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: '0',
                        fontSize: '16px',
                        lineHeight: '1',
                      }}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Only killmails involving these corporations will be ingested (if Ignore Unlisted is enabled)
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={ignoreUnlisted}
              onChange={(e) => setIgnoreUnlisted(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#0f172a' }}>
              Ignore Unlisted Entities
            </span>
          </label>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', marginLeft: '26px' }}>
            When enabled, only killmails involving tracked alliances/corps will be ingested
          </div>
        </div>

        {ingestionConfig && (
          <div
            style={{
              fontSize: '12px',
              color: '#64748b',
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid #e2e8f0',
            }}
          >
            Last updated: {new Date(ingestionConfig.ruleset.updatedAt).toLocaleString()}
          </div>
        )}

        <button
          onClick={() => void handleSaveIngestion()}
          disabled={saving}
          style={{
            marginTop: '16px',
            padding: '10px 20px',
            backgroundColor: '#0ea5e9',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.5 : 1,
            fontWeight: '600',
          }}
        >
          {saving ? 'Saving...' : 'Save Ingestion Config'}
        </button>
      </div>

      {/* Clustering Configuration */}
      <div
        style={{
          backgroundColor: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '24px',
        }}
      >
        <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>
          Clustering Settings
        </h2>

        <div style={{ display: 'grid', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#0f172a', marginBottom: '8px' }}>
              Time Window (minutes)
            </label>
            <input
              type="number"
              value={windowMinutes ?? ''}
              onChange={(e) => setWindowMinutes(parseInt(e.target.value) || undefined)}
              min={5}
              max={180}
              placeholder="e.g., 60"
              style={{
                width: '200px',
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
              }}
            />
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Maximum time between first and last kill in a battle (5-180 minutes)
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#0f172a', marginBottom: '8px' }}>
              Maximum Kill Gap (minutes)
            </label>
            <input
              type="number"
              value={gapMaxMinutes ?? ''}
              onChange={(e) => setGapMaxMinutes(parseInt(e.target.value) || undefined)}
              min={1}
              max={60}
              placeholder="e.g., 10"
              style={{
                width: '200px',
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
              }}
            />
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Maximum time between consecutive kills in a battle (1-60 minutes)
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#0f172a', marginBottom: '8px' }}>
              Minimum Kills per Battle
            </label>
            <input
              type="number"
              value={minKills ?? ''}
              onChange={(e) => setMinKills(parseInt(e.target.value) || undefined)}
              min={1}
              max={100}
              placeholder="e.g., 3"
              style={{
                width: '200px',
                padding: '8px 12px',
                fontSize: '14px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
              }}
            />
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Minimum number of killmails required to create a battle (1-100)
            </div>
          </div>
        </div>

        <button
          onClick={() => void handleSaveClustering()}
          disabled={saving}
          style={{
            marginTop: '24px',
            padding: '10px 20px',
            backgroundColor: '#0ea5e9',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.5 : 1,
            fontWeight: '600',
          }}
        >
          {saving ? 'Saving...' : 'Save Clustering Config'}
        </button>
      </div>
    </div>
  );
};
