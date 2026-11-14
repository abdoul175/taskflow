import { useEffect, useState, type FormEvent } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';
import { api, getErrorMessage } from '../api';
import type {
  Project,
  Task,
  TaskInput,
  TaskPriority,
  TaskStatus,
} from '../types';
import { Modal } from './Modal';

interface TaskModalProps {
  open: boolean;
  task: Task | null;
  projects: Project[];
  defaultProjectId?: string;
  defaultStatus?: TaskStatus;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

interface FormState {
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
}

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; active: string }[] = [
  { value: 'low', label: 'Low', active: 'bg-sky-500/15 text-sky-300' },
  { value: 'medium', label: 'Medium', active: 'bg-amber-500/15 text-amber-300' },
  { value: 'high', label: 'High', active: 'bg-rose-500/15 text-rose-300' },
];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

export function TaskModal({
  open,
  task,
  projects,
  defaultProjectId,
  defaultStatus = 'todo',
  onClose,
  onSaved,
}: TaskModalProps) {
  const [form, setForm] = useState<FormState>({
    projectId: '',
    title: '',
    description: '',
    status: defaultStatus,
    priority: 'medium',
    dueDate: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstProjectId = projects[0]?.id ?? '';

  useEffect(() => {
    if (!open) return;

    setError(null);
    setForm(
      task
        ? {
            projectId: task.projectId,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate ?? '',
          }
        : {
            projectId: defaultProjectId ?? firstProjectId,
            title: '',
            description: '',
            status: defaultStatus,
            priority: 'medium',
            dueDate: '',
          },
    );
  }, [open, task, defaultProjectId, defaultStatus, firstProjectId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = form.title.trim();
    if (!title) {
      setError('Give the task a title.');
      return;
    }
    if (!form.projectId) {
      setError('Create a project first.');
      return;
    }

    const payload: TaskInput = {
      projectId: form.projectId,
      title,
      description: form.description.trim(),
      status: form.status,
      priority: form.priority,
      dueDate: form.dueDate || null,
    };

    setSaving(true);
    setError(null);

    try {
      if (task) {
        await api.tasks.update(task.id, payload);
      } else {
        await api.tasks.create(payload);
      }
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Could not save the task.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? 'Edit task' : 'New task'}
      description={
        task ? 'Update the details or move it along.' : 'What needs to get done?'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="task-title" className="label">
            Title
          </label>
          <input
            id="task-title"
            className="input"
            type="text"
            required
            maxLength={200}
            autoFocus
            placeholder="e.g. Prepare the launch checklist"
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
          />
        </div>

        <div>
          <label htmlFor="task-description" className="label">
            Description <span className="font-normal normal-case text-slate-600">(optional)</span>
          </label>
          <textarea
            id="task-description"
            className="input resize-none"
            rows={3}
            maxLength={2000}
            placeholder="Add context, links, or acceptance criteria…"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="task-project" className="label">
              Project
            </label>
            <select
              id="task-project"
              className="input"
              required
              value={form.projectId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  projectId: event.target.value,
                }))
              }
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="task-status" className="label">
              Status
            </label>
            <select
              id="task-status"
              className="input"
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as TaskStatus,
                }))
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="label">Priority</span>
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-[#0a1120] p-1">
              {PRIORITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      priority: option.value,
                    }))
                  }
                  aria-pressed={form.priority === option.value}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                    form.priority === option.value
                      ? option.active
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="task-due" className="label">
              Due date <span className="font-normal normal-case text-slate-600">(optional)</span>
            </label>
            <input
              id="task-due"
              className="input"
              type="date"
              value={form.dueDate}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  dueDate: event.target.value,
                }))
              }
            />
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
            ) : task ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {task ? 'Save changes' : 'Create task'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
