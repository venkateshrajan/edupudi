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
