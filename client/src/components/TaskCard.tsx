import {
  CalendarDays,
  Check,
  Pencil,
  Play,
  RotateCcw,
  Trash2,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { formatDueDate } from '../lib/dates';
import type { Task, TaskPriority, TaskStatus } from '../types';

const PRIORITY_STYLES: Record<
  TaskPriority,
  { label: string; className: string }
> = {
  high: {
    label: 'High',
    className: 'border-rose-400/20 bg-rose-400/10 text-rose-300',
  },
  medium: {
    label: 'Medium',
    className: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  },
  low: {
    label: 'Low',
    className: 'border-sky-400/20 bg-sky-400/10 text-sky-300',
  },
};

interface MoveAction {
  label: string;
  next: TaskStatus;
  icon: LucideIcon;
}

const MOVE_ACTIONS: Record<TaskStatus, MoveAction[]> = {
  todo: [{ label: 'Start', next: 'in_progress', icon: Play }],
  in_progress: [
    { label: 'Move back', next: 'todo', icon: Undo2 },
    { label: 'Complete', next: 'done', icon: Check },
  ],
  done: [{ label: 'Reopen', next: 'todo', icon: RotateCcw }],
};

interface TaskCardProps {
  task: Task;
  index: number;
  showProject: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
}

export function TaskCard({
  task,
  index,
  showProject,
  onEdit,
  onDelete,
  onMove,
}: TaskCardProps) {
  const priority = PRIORITY_STYLES[task.priority];
  const due = task.dueDate ? formatDueDate(task.dueDate) : null;
  const overdue = Boolean(due?.overdue && task.status !== 'done');

  return (
    <article
      onClick={() => onEdit(task)}
      style={{ animationDelay: `${Math.min(index, 8) * 28}ms` }}
      className="animate-rise group cursor-pointer rounded-xl border border-white/[0.07] bg-[#0d1526] p-3.5 shadow-sm shadow-black/20 transition hover:border-white/15 hover:bg-[#101a2e]"
    >
      <div className="flex items-start justify-between gap-2.5">
        <h3
          className={`text-sm font-semibold leading-snug ${
            task.status === 'done'
              ? 'text-slate-400 line-through decoration-slate-500'
              : 'text-slate-100'
          }`}
        >
          {task.title}
        </h3>
        <span
          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priority.className}`}
        >
          {priority.label}
        </span>
      </div>

      {task.description && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">
          {task.description}
        </p>
      )}

      {(due || showProject) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {showProject && (
            <span className="chip">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: task.projectColor }}
                aria-hidden="true"
              />
              <span className="max-w-[110px] truncate">{task.projectName}</span>
            </span>
          )}
          {due && (
            <span
              className={`chip ${
                overdue
                  ? 'border-rose-400/20 bg-rose-400/10 text-rose-300'
                  : ''
              }`}
            >
              <CalendarDays className="h-3 w-3" aria-hidden="true" />
              {due.label}
              {overdue ? ' · Overdue' : ''}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2.5 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <div className="flex items-center gap-0.5">
          {MOVE_ACTIONS[task.status].map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onMove(task, action.next);
                }}
                className="icon-btn h-7 w-7"
                title={action.label}
                aria-label={`${action.label}: ${task.title}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(task);
            }}
            className="icon-btn h-7 w-7"
            title="Edit task"
            aria-label={`Edit ${task.title}`}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(task);
            }}
            className="icon-btn h-7 w-7 hover:text-rose-300"
            title="Delete task"
            aria-label={`Delete ${task.title}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}
