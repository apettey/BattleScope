import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCurrentRuleset, updateRuleset, type Ruleset } from './api.js';

interface FormState {
  minPilots: number;
  trackedAllianceIds: string;
  trackedCorpIds: string;
  ignoreUnlisted: boolean;
  updatedBy: string;
}

const toTextareaValue = (values: string[]): string => values.join('\n');

const parseList = (value: string): string[] => {
  return value
    .split(/\s|,|;|\n|\r/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const buildFormState = (ruleset: Ruleset): FormState => ({
  minPilots: ruleset.minPilots,
  trackedAllianceIds: toTextareaValue(ruleset.trackedAllianceIds),
  trackedCorpIds: toTextareaValue(ruleset.trackedCorpIds),
  ignoreUnlisted: ruleset.ignoreUnlisted,
  updatedBy: ruleset.updatedBy ?? '',
});

export const RulesView = () => {
  const [ruleset, setRuleset] = useState<Ruleset | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const current = await fetchCurrentRuleset({ signal: controller.signal });
      if (!controller.signal.aborted) {
        setRuleset(current);
        setForm(buildFormState(current));
      }
    } catch (thrown) {
      if (!controller.signal.aborted) {
        setError(thrown instanceof Error ? thrown.message : String(thrown));
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  const handleChange = useCallback(<T extends keyof FormState>(key: T, value: FormState[T]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!form) {
        return;
      }
      setSaving(true);
      setSuccess(null);
      setError(null);
      try {
        const next = await updateRuleset({
          minPilots: Number.isFinite(form.minPilots) ? Math.max(1, Math.trunc(form.minPilots)) : 1,
          trackedAllianceIds: parseList(form.trackedAllianceIds),
          trackedCorpIds: parseList(form.trackedCorpIds),
          ignoreUnlisted: form.ignoreUnlisted,
          updatedBy: form.updatedBy.trim() || null,
        });
        setRuleset(next);
        setForm(buildFormState(next));
        setSuccess('Rules updated successfully.');
      } catch (thrown) {
        setError(thrown instanceof Error ? thrown.message : String(thrown));
      } finally {
        setSaving(false);
      }
    },
    [form],
  );

  const canSubmit = useMemo(() => {
    if (!ruleset || !form) {
      return false;
    }
    const normalize = (value: string[]) =>
      value
        .map((entry) => entry.trim())
        .filter(Boolean)
        .sort()
        .join(',');
    return (
      ruleset.minPilots !== form.minPilots ||
      ruleset.ignoreUnlisted !== form.ignoreUnlisted ||
      normalize(ruleset.trackedAllianceIds) !== normalize(parseList(form.trackedAllianceIds)) ||
      normalize(ruleset.trackedCorpIds) !== normalize(parseList(form.trackedCorpIds)) ||
      (ruleset.updatedBy ?? '') !== form.updatedBy.trim()
    );
  }, [ruleset, form]);

  const resetForm = useCallback(() => {
    if (ruleset) {
      setForm(buildFormState(ruleset));
      setSuccess(null);
      setError(null);
    }
  }, [ruleset]);

  return (
    <section
      aria-labelledby="rules-heading"
      style={{ display: 'grid', gap: '1.5rem', maxWidth: '48rem' }}
    >
      <header>
        <h2 id="rules-heading">Rules Configuration</h2>
        <p>
          Control how BattleScope filters killmails during ingestion. Authentication is not enabled
          yet, so treat these settings as shared across Operators.
        </p>
        {error && (
          <p role="alert" style={{ color: '#b91c1c' }}>
            {error}
          </p>
        )}
        {success && (
          <p role="status" style={{ color: '#047857' }}>
            {success}
          </p>
        )}
      </header>

      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        style={{ display: 'grid', gap: '1rem' }}
      >
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Minimum pilots required per killmail</span>
          <input
            type="number"
            min={1}
            value={form?.minPilots ?? ''}
            onChange={(event) => handleChange('minPilots', Number(event.target.value))}
            disabled={loading || saving}
            required
          />
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Tracked alliance IDs (one per line)</span>
          <textarea
            rows={4}
            value={form?.trackedAllianceIds ?? ''}
            onChange={(event) => handleChange('trackedAllianceIds', event.target.value)}
            disabled={loading || saving}
            placeholder="99001234\n99005678"
          />
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Tracked corporation IDs (one per line)</span>
          <textarea
            rows={4}
            value={form?.trackedCorpIds ?? ''}
            onChange={(event) => handleChange('trackedCorpIds', event.target.value)}
            disabled={loading || saving}
            placeholder="123456\n654321"
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={form?.ignoreUnlisted ?? false}
            onChange={(event) => handleChange('ignoreUnlisted', event.target.checked)}
            disabled={loading || saving}
          />
          Ignore killmails that do not match tracked alliances or corporations
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Change note (optional)</span>
          <input
            type="text"
            placeholder="Who is making this change?"
            value={form?.updatedBy ?? ''}
            onChange={(event) => handleChange('updatedBy', event.target.value)}
            disabled={loading || saving}
          />
        </label>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="submit" disabled={!canSubmit || saving || loading}>
            {saving ? 'Saving…' : 'Save rules'}
          </button>
          <button type="button" disabled={loading || saving} onClick={resetForm}>
            Reset
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: '#475569' }}>
          Each update is logged server-side for future audit trails once authentication is enabled.
        </p>
      </form>
    </section>
  );
};
