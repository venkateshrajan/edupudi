import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TerminalPane } from './components/TerminalPane';
import { ScheduleModal } from './components/ScheduleModal';
import { listChannels, createChannel, type Channel } from './api';

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);

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

  const activeChannel = channels.find((c) => c.id === active) ?? null;

  return (
    <div className="app">
      <Sidebar channels={channels} active={active} onSelect={setActive} onNew={onNew} />
      <main className="main">
        {activeChannel ? (
          <div className="channel-view">
            <header className="channel-head">
              <span className="channel-title">
                <span className="hash">#</span>
                {activeChannel.id}
              </span>
              <button
                className="head-btn"
                onClick={() => setScheduling(true)}
                title="Manage this channel's recurring schedule"
              >
                Schedule
              </button>
            </header>
            <TerminalPane key={activeChannel.id} channelId={activeChannel.id} />
          </div>
        ) : (
          <div className="placeholder">Create a channel to begin</div>
        )}
      </main>
      {scheduling && activeChannel && (
        <ScheduleModal
          channelId={activeChannel.id}
          channelName={activeChannel.id}
          onClose={() => setScheduling(false)}
        />
      )}
    </div>
  );
}
