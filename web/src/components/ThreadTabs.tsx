import { isMainThread, type Thread } from '../api';

interface Props {
  threads: Thread[];
  active: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: (thread: Thread) => void;
}

/** Tab bar above the terminal pane: lists a Channel's Threads, creates one, and switches between
 *  them. The `main` Thread is never closeable. */
export function ThreadTabs({ threads, active, onSelect, onNew, onClose }: Props) {
  return (
    <div className="thread-tabs">
      {threads.map((t) => {
        const label = t.title || t.id.slice(0, 8);
        return (
          <div
            key={t.id}
            className={`thread-tab${t.id === active ? ' active' : ''}`}
            onClick={() => onSelect(t.id)}
            title={t.title || t.id}
          >
            <span className="thread-tab-label">{label}</span>
            {!isMainThread(t) && (
              <button
                className="thread-tab-close"
                title="Delete thread"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t);
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      <button className="thread-tab-new" onClick={onNew} title="New thread">
        ＋
      </button>
    </div>
  );
}
