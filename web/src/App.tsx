import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TerminalPane } from './components/TerminalPane';
import { listChannels, createChannel, type Channel } from './api';

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState<string | null>(null);

  async function refresh(select?: string) {
    const cs = await listChannels();
    setChannels(cs);
    setActive((cur) => select ?? cur ?? cs[0]?.id ?? null);
  }

  useEffect(() => {
    refresh().catch((e) => console.error(e));
  }, []);

  async function onNew() {
    const name = window.prompt('Channel name (e.g. Business)');
    if (!name) return;
    const systemPrompt = window.prompt('System prompt for this channel') ?? '';
    try {
      const c = await createChannel({ name, systemPrompt });
      await refresh(c.id);
    } catch (e) {
      window.alert((e as Error).message);
    }
  }

  return (
    <div className="app">
      <Sidebar channels={channels} active={active} onSelect={setActive} onNew={onNew} />
      <main className="main">
        {active ? (
          <TerminalPane key={active} channelId={active} />
        ) : (
          <div className="placeholder">Create a channel to begin</div>
        )}
      </main>
    </div>
  );
}
