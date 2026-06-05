import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TerminalPane } from './components/TerminalPane';
import { ThreadTabs } from './components/ThreadTabs';
import { NewChannelModal } from './components/NewChannelModal';
import { ScheduleModal } from './components/ScheduleModal';
import {
  listChannels,
  listThreads,
  createThread,
  deleteThread,
  isMainThread,
  type Channel,
  type Thread,
} from './api';

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  async function refresh(select?: string) {
    const cs = await listChannels();
    setChannels(cs);
    setActive((cur) => select ?? cur ?? cs[0]?.id ?? null);
  }

  useEffect(() => {
    refresh().catch((e) => console.error(e));
  }, []);

  // Load the active Channel's Threads; land on its `main` Thread by default.
  async function refreshThreads(channelId: string, select?: string) {
    const ts = await listThreads(channelId);
    setThreads(ts);
    const main = ts.find(isMainThread) ?? ts[0];
    setActiveThread((cur) => {
      if (select) return select;
      if (cur && ts.some((t) => t.id === cur)) return cur;
      return main?.id ?? null;
    });
  }

  useEffect(() => {
    if (!active) {
      setThreads([]);
      setActiveThread(null);
      return;
    }
    setActiveThread(null);
    refreshThreads(active).catch((e) => console.error(e));
  }, [active]);

  function onCreated(channel: Channel) {
    setChannels((cur) =>
      cur.some((c) => c.id === channel.id) ? cur : [...cur, channel],
    );
    setActive(channel.id);
    setShowNew(false);
  }

  async function onNewThread() {
    if (!active) return;
    const title = window.prompt('Thread title (optional)') ?? undefined;
    try {
      const t = await createThread(active, title);
      await refreshThreads(active, t.id);
    } catch (e) {
      window.alert((e as Error).message);
    }
  }

  async function onCloseThread(thread: Thread) {
    if (!active) return;
    if (!window.confirm(`Delete thread "${thread.title || thread.id}"? Its transcript is purged.`)) {
      return;
    }
    try {
      await deleteThread(active, thread.id);
      if (activeThread === thread.id) setActiveThread(null);
      await refreshThreads(active);
    } catch (e) {
      window.alert((e as Error).message);
    }
  }

  const activeChannel = channels.find((c) => c.id === active) ?? null;

  return (
    <div className="app">
      <Sidebar
        channels={channels}
        active={active}
        onSelect={setActive}
        onNew={() => setShowNew(true)}
      />
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
            <ThreadTabs
              threads={threads}
              active={activeThread}
              onSelect={setActiveThread}
              onNew={onNewThread}
              onClose={onCloseThread}
            />
            {activeThread ? (
              <TerminalPane
                key={`${activeChannel.id}:${activeThread}`}
                channelId={activeChannel.id}
                threadId={activeThread}
              />
            ) : (
              <div className="placeholder">Loading thread…</div>
            )}
          </div>
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
      {scheduling && activeChannel && (
        <ScheduleModal
          channelId={activeChannel.id}
          channelName={activeChannel.name}
          onClose={() => setScheduling(false)}
        />
      )}
    </div>
  );
}
