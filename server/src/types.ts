export interface Channel {
  id: string; // slug; also tmux session suffix and directory name
  name: string; // display name
  persona: string; // one-line description
  dir: string; // absolute path of the channel directory
  created_at: number;
}

export type ThreadState = 'live' | 'parked' | 'expired';

export interface Thread {
  id: string; // UUID; *is* the Claude session-id (ADR-0002), used for --session-id/--resume
  channel_id: string;
  title: string;
  started: boolean; // false until first attach launches claude; decides --session-id vs --resume
  state: ThreadState; // live | parked | expired (lifecycle)
  created_at: number;
}

export const MAIN_THREAD_TITLE = 'main';
