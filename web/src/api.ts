export interface Channel {
  id: string;
  name: string;
  persona: string;
  dir: string;
  created_at: number;
}

export async function listChannels(): Promise<Channel[]> {
  const r = await fetch('/api/channels');
  if (!r.ok) throw new Error('failed to load channels');
  return r.json();
}

export async function createChannel(body: {
  name: string;
  persona?: string;
  systemPrompt: string;
}): Promise<Channel> {
  const r = await fetch('/api/channels', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'failed to create channel');
  return r.json();
}

/** Mirror of the server's ScheduleStatus (scheduler.ts). */
export interface ScheduleStatus {
  installed: boolean;
  enabled: boolean;
  active: boolean;
  onCalendar: string | null;
  prompt: string | null;
  nextRun: string | null;
  lastRun: string | null;
  lastResult: string | null;
}

export async function getSchedule(channelId: string): Promise<ScheduleStatus> {
  const r = await fetch(`/api/channels/${encodeURIComponent(channelId)}/schedule`);
  if (!r.ok) throw new Error('failed to load schedule');
  return r.json();
}

export async function saveSchedule(
  channelId: string,
  body: { onCalendar: string; prompt: string },
): Promise<ScheduleStatus> {
  const r = await fetch(`/api/channels/${encodeURIComponent(channelId)}/schedule`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'failed to save schedule');
  return r.json();
}

export async function removeSchedule(channelId: string): Promise<ScheduleStatus> {
  const r = await fetch(`/api/channels/${encodeURIComponent(channelId)}/schedule`, {
    method: 'DELETE',
  });
  if (!r.ok) throw new Error('failed to remove schedule');
  return r.json();
}

/**
 * Friendly schedule presets → systemd OnCalendar expressions.
 * `daily` and `weekdays` carry an editable time-of-day; `custom` lets the user
 * type a raw OnCalendar expression (any valid systemd calendar event).
 */
export interface SchedulePreset {
  id: 'daily' | 'weekdays' | 'weekly' | 'hourly' | 'custom';
  label: string;
  /** Build the OnCalendar expression from an "HH:MM" time (ignored by custom/hourly). */
  toOnCalendar?: (time: string) => string;
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  { id: 'daily', label: 'Daily', toOnCalendar: (t) => `*-*-* ${t}:00` },
  { id: 'weekdays', label: 'Weekdays', toOnCalendar: (t) => `Mon..Fri *-*-* ${t}:00` },
  { id: 'weekly', label: 'Weekly (Mon)', toOnCalendar: (t) => `Mon *-*-* ${t}:00` },
  { id: 'hourly', label: 'Hourly', toOnCalendar: () => 'hourly' },
  { id: 'custom', label: 'Custom expression' },
];
