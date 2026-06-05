export interface Channel {
  id: string; // slug; also tmux session suffix and directory name
  name: string; // display name
  persona: string; // one-line description
  dir: string; // absolute path of the channel directory
  created_at: number;
}

export interface Thread {
  id: string;
  channel_id: string;
  title: string;
  session_id: string | null; // claude --resume id, populated after first run
  created_at: number;
}
