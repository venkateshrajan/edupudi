export interface Channel {
  id: string;
  name: string;
  persona: string;
  dir: string;
  created_at: number;
}

/**
 * Derive a channel slug from a display name.
 * MUST match the server's slugify in server/src/channels.ts so client-side
 * duplicate detection lines up with the id the backend will assign.
 */
export const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

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

// A Thread is a resumable Claude conversation within a Channel; its id *is* the Claude session-id.
export type ThreadState = 'live' | 'parked' | 'expired';

export interface Thread {
  id: string;
  channel_id: string;
  title: string;
  started: boolean;
  state: ThreadState;
  created_at: number;
}

export const MAIN_THREAD_TITLE = 'main';

export const isMainThread = (t: Thread): boolean => t.title === MAIN_THREAD_TITLE;

export async function listThreads(channelId: string): Promise<Thread[]> {
  const r = await fetch(`/api/channels/${encodeURIComponent(channelId)}/threads`);
  if (!r.ok) throw new Error('failed to load threads');
  return r.json();
}

export async function createThread(channelId: string, title?: string): Promise<Thread> {
  const r = await fetch(`/api/channels/${encodeURIComponent(channelId)}/threads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'failed to create thread');
  return r.json();
}

export async function deleteThread(channelId: string, threadId: string): Promise<void> {
  const r = await fetch(
    `/api/channels/${encodeURIComponent(channelId)}/threads/${encodeURIComponent(threadId)}`,
    { method: 'DELETE' },
  );
  if (!r.ok && r.status !== 204) {
    throw new Error((await r.json().catch(() => ({}))).error ?? 'failed to delete thread');
  }
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
