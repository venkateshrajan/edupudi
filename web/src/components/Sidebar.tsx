import type { Channel } from '../api';

interface Props {
  channels: Channel[];
  active: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function Sidebar({ channels, active, onSelect, onNew }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="brand">edupudi</span>
        <button className="new-btn" onClick={onNew} title="New channel">
          ＋
        </button>
      </div>
      <ul className="channel-list">
        {channels.map((c) => (
          <li
            key={c.id}
            className={c.id === active ? 'active' : ''}
            onClick={() => onSelect(c.id)}
            title={c.persona || c.name}
          >
            <span className="hash">#</span>
            {c.id}
          </li>
        ))}
        {channels.length === 0 && <li className="empty">no channels yet</li>}
      </ul>
    </aside>
  );
}
