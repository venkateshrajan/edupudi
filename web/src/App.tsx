import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TerminalPane } from './components/TerminalPane';
import { NewChannelModal } from './components/NewChannelModal';
import { listChannels, type Channel } from './api';

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function refresh(select?: string) {
    const cs = await listChannels();
    setChannels(cs);
    setActive((cur) => select ?? cur ?? cs[0]?.id ?? null);
  }

  useEffect(() => {
    refresh().catch((e) => console.error(e));
  }, []);

  function onCreated(channel: Channel) {
    setChannels((cur) =>
      cur.some((c) => c.id === channel.id) ? cur : [...cur, channel],
    );
    setActive(channel.id);
    setShowNew(false);
  }

  return (
    <div className="app">
      <Sidebar
        channels={channels}
        active={active}
        onSelect={setActive}
        onNew={() => setShowNew(true)}
      />
      <main className="main">
        {active ? (
          <TerminalPane key={active} channelId={active} />
        ) : (
          <div className="placeholder">Create a channel to begin</div>
        )}
      </main>
      {showNew && (
        <NewChannelModal
          existingIds={channels.map((c) => c.id)}
          onClose={() => setShowNew(false)}
          onCreated={onCreated}
        />
      )}
    </div>
  );
}
