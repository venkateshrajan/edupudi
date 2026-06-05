import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

/**
 * Renders the live Claude Code TUI for a channel by bridging xterm.js to the backend
 * WebSocket, which is wired to a node-pty attached to the channel's tmux session.
 */
export function TerminalPane({ channelId }: { channelId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: { background: '#0b0e14', foreground: '#c8d3f5' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?channel=${encodeURIComponent(channelId)}`);
    ws.binaryType = 'arraybuffer';

    const send = (o: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o));
    };
    const syncSize = () => {
      fit.fit();
      send({ type: 'resize', cols: term.cols, rows: term.rows });
    };

    ws.onopen = syncSize;
    ws.onmessage = (e) =>
      term.write(typeof e.data === 'string' ? e.data : new Uint8Array(e.data));

    const dataSub = term.onData((d) => send({ type: 'input', data: d }));
    window.addEventListener('resize', syncSize);

    return () => {
      window.removeEventListener('resize', syncSize);
      dataSub.dispose();
      ws.close();
      term.dispose();
    };
  }, [channelId]);

  return <div className="terminal-host" ref={hostRef} />;
}
