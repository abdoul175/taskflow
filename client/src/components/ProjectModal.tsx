import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { api, getErrorMessage } from '../api';
import type { Project } from '../types';
import { Modal } from './Modal';

interface ProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void | Promise<void>;
}

const COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f59e0b',
  '#22c55e',
  '#14b8a6',
  '#0ea5e9',
];

export function ProjectModal({ open, onClose, onCreated }: ProjectModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]!);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setColor(COLORS[0]!);
    setError(null);
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the project a name.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const project = await api.projects.create({ name: trimmed, color });
      await onCreated(project);
      onClose();
    } catch (createError) {
      setError(getErrorMessage(createError, 'Could not create the project.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      description="Group related tasks under a name and color."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="project-name" className="label">
            Name
          </label>
          <input
            id="project-name"
            className="input"
            type="text"
            required
            maxLength={60}
            autoFocus
            placeholder="e.g. Product launch"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div>
          <span className="label">Color</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setColor(option)}
                aria-label={`Use color ${option}`}
                aria-pressed={color === option}
                className={`h-8 w-8 rounded-full transition ${
                  color === option
                    ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-[#0b1220]'
                    : 'opacity-70 hover:opacity-100'
                }`}
                style={{ backgroundColor: option }}
              />
            ))}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-300"
          >
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            Create project
          </button>
        </div>
      </form>
    </Modal>
  );
}
