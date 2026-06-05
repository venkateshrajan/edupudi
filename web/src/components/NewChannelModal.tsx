import { useEffect, useRef, useState } from 'react';
import { createChannel, slugify, type Channel } from '../api';

interface Props {
  /** Existing channel ids, used for client-side duplicate-slug detection. */
  existingIds: string[];
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}

export function NewChannelModal({ existingIds, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [persona, setPersona] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const slug = slugify(name);
  const duplicate = slug !== '' && existingIds.includes(slug);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!slug) {
      setError('Name must contain at least one letter or number.');
      return;
    }
    if (existingIds.includes(slug)) {
      setError(`A channel named "${slug}" already exists.`);
      return;
    }
    if (!systemPrompt.trim()) {
      setError('System prompt is required.');
      return;
    }

    setSubmitting(true);
    try {
      const channel = await createChannel({
        name: name.trim(),
        persona: persona.trim() || undefined,
        systemPrompt,
      });
      onCreated(channel);
    } catch (err) {
      setError((err as Error).message || 'Failed to create channel.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="New channel"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <form onSubmit={onSubmit}>
          <h2 className="modal-title">New channel</h2>

          <label className="field">
            <span className="field-label">Name</span>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Business"
              autoComplete="off"
            />
            {slug && (
              <span className={`slug-hint${duplicate ? ' slug-hint-dup' : ''}`}>
                #{slug}
                {duplicate ? ' — already exists' : ''}
              </span>
            )}
          </label>

          <label className="field">
            <span className="field-label">
              Persona <span className="field-optional">(optional)</span>
            </span>
            <input
              type="text"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="A pragmatic business partner"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span className="field-label">System prompt</span>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Describe how this channel should behave…"
              rows={6}
            />
          </label>

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || duplicate}>
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
