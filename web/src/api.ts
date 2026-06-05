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
