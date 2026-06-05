import { useEffect, useState } from 'react';
import {
  getSchedule,
  saveSchedule,
  removeSchedule,
  SCHEDULE_PRESETS,
  type ScheduleStatus,
  type SchedulePreset,
} from '../api';

/**
 * Manage a Channel's recurring headless `claude -p` run (a systemd user timer).
 * Lets the user pick a friendly preset (daily/weekdays/…) plus a time, or type a
 * raw OnCalendar expression, set the prompt, and install / edit / remove the timer —
 * all without touching systemd by hand.
 */
export function ScheduleModal({
  channelId,
  channelName,
  onClose,
}: {
  channelId: string;
  channelName: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<ScheduleStatus | null>(null);
  const [presetId, setPresetId] = useState<SchedulePreset['id']>('daily');
  const [time, setTime] = useState('08:00');
  const [custom, setCustom] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current status and seed the form from any existing schedule.
  useEffect(() => {
    let cancelled = false;
    getSchedule(channelId)
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        if (s.prompt) setPrompt(s.prompt);
        if (s.installed && s.onCalendar) {
          // We can't always reverse a preset, so an existing schedule edits as custom.
          setPresetId('custom');
          setCustom(s.onCalendar);
        }
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const preset = SCHEDULE_PRESETS.find((p) => p.id === presetId)!;
  const onCalendar =
    presetId === 'custom' ? custom.trim() : preset.toOnCalendar?.(time) ?? '';
  const needsTime = presetId !== 'custom' && presetId !== 'hourly';

  async function onSave() {
    setError(null);
    if (!onCalendar) {
      setError('Provide an OnCalendar expression.');
      return;
    }
    if (!prompt.trim()) {
      setError('Provide a prompt to run.');
      return;
    }
    setBusy(true);
    try {
      setStatus(await saveSchedule(channelId, { onCalendar, prompt: prompt.trim() }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setError(null);
    setBusy(true);
    try {
      const s = await removeSchedule(channelId);
      setStatus(s);
      setPresetId('daily');
      setCustom('');
      setPrompt('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Schedule · #{channelName}</h2>
          <button className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        {status && (
          <div className="sched-status">
            {status.installed ? (
              <>
                <span className={`badge ${status.enabled ? 'ok' : 'warn'}`}>
                  {status.enabled ? 'enabled' : 'installed (not enabled)'}
                </span>
                {status.active && <span className="badge ok">active</span>}
                {status.onCalendar && (
                  <code className="sched-expr">{status.onCalendar}</code>
                )}
              </>
            ) : (
              <span className="badge muted">no schedule installed</span>
            )}
          </div>
        )}

        {status?.installed && (status.nextRun || status.lastRun || status.lastResult) && (
          <dl className="sched-runs">
            {status.nextRun && (
              <>
                <dt>Next run</dt>
                <dd>{status.nextRun}</dd>
              </>
            )}
            {status.lastRun && (
              <>
                <dt>Last run</dt>
                <dd>{status.lastRun}</dd>
              </>
            )}
            {status.lastResult && (
              <>
                <dt>Last result</dt>
                <dd>{status.lastResult}</dd>
              </>
            )}
          </dl>
        )}

        <label className="field">
          <span>When</span>
          <div className="row">
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value as SchedulePreset['id'])}
            >
              {SCHEDULE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {needsTime && (
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            )}
          </div>
        </label>

        {presetId === 'custom' && (
          <label className="field">
            <span>OnCalendar expression</span>
            <input
              type="text"
              placeholder="e.g. Mon..Fri *-*-* 09:00:00"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          </label>
        )}

        <div className="sched-preview">
          OnCalendar=<code>{onCalendar || '—'}</code>
        </div>

        <label className="field">
          <span>Prompt to run</span>
          <textarea
            rows={4}
            placeholder="e.g. Review yesterday's notes and update memory."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>

        {error && <div className="sched-error">{error}</div>}

        <div className="modal-actions">
          {status?.installed && (
            <button className="btn danger" onClick={onRemove} disabled={busy}>
              Remove
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={onSave} disabled={busy}>
            {status?.installed ? 'Save changes' : 'Create schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
