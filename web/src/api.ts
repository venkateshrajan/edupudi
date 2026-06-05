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
