import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlarmClock,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  LogOut,
  Plus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api, getErrorMessage } from '../api';
import { useAuth } from '../auth';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LogoMark } from '../components/Logo';
import { ProfileModal } from '../components/ProfileModal';
import { ProjectModal } from '../components/ProjectModal';
import { Sidebar } from '../components/Sidebar';
import { TaskCard } from '../components/TaskCard';
import { TaskModal } from '../components/TaskModal';
import { formatHeaderDate, greeting, isOverdue } from '../lib/dates';
import type { Project, Task, TaskStatus, User } from '../types';

const COLUMNS: { key: TaskStatus; label: string; dot: string }[] = [
  { key: 'todo', label: 'To do', dot: 'bg-slate-400' },
  { key: 'in_progress', label: 'In progress', dot: 'bg-sky-400' },
  { key: 'done', label: 'Done', dot: 'bg-emerald-400' },
];

type Tone = 'indigo' | 'emerald' | 'rose' | 'slate';

const TONE_STYLES: Record<Tone, string> = {
  indigo: 'border-indigo-400/15 bg-indigo-400/10 text-indigo-300',
  emerald: 'border-emerald-400/15 bg-emerald-400/10 text-emerald-300',
  rose: 'border-rose-400/15 bg-rose-400/10 text-rose-300',
  slate: 'border-white/10 bg-white/[0.04] text-slate-400',
};

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: Tone;
}) {
  return (
    <div className="surface flex items-center gap-3 p-3.5 sm:p-4">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${TONE_STYLES[tone]}`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none tracking-tight text-white sm:text-xl">
          {value}
        </p>
        <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-wider text-slate-500">
          {label}
        </p>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function sortByDueDate(a: Task, b: Task): number {
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return b.createdAt.localeCompare(a.createdAt);
}

interface MobileBarProps {
  user: User;
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onNewProject: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
}

function MobileBar({
  user,
  projects,
  selectedProjectId,
  onSelectProject,
  onNewProject,
  onOpenProfile,
  onLogout,
}: MobileBarProps) {
  return (
    <div className="lg:hidden">
      <div className="flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="text-sm font-semibold tracking-tight text-white">
            Taskflow
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenProfile}
            className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-[11px] font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
            title="Edit profile"
          >
            {initials(user.name)}
            <span className="sr-only">Edit profile</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="icon-btn h-8 w-8"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
        <button
          type="button"
          onClick={() => onSelectProject(null)}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            selectedProjectId === null
              ? 'border-indigo-400/30 bg-indigo-500/15 text-indigo-100'
              : 'border-white/10 bg-white/[0.03] text-slate-400'
          }`}
        >
          All tasks
        </button>
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelectProject(project.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              selectedProjectId === project.id
                ? 'border-indigo-400/30 bg-indigo-500/15 text-indigo-100'
                : 'border-white/10 bg-white/[0.03] text-slate-400'
            }`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: project.color }}
              aria-hidden="true"
            />
            {project.name}
          </button>
        ))}
        <button
          type="button"
          onClick={onNewProject}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-white/15 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:border-indigo-400/30 hover:text-slate-300"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          New
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [taskDialog, setTaskDialog] = useState<{
    open: boolean;
    task: Task | null;
    status: TaskStatus;
  }>({ open: false, task: null, status: 'todo' });
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);

  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refreshAll = useCallback(async () => {
    const [nextProjects, nextTasks] = await Promise.all([
      api.projects.list(),
      api.tasks.list(),
    ]);
    setProjects(nextProjects);
    setTasks(nextTasks);
  }, []);

  useEffect(() => {
    let active = true;

    refreshAll()
      .catch((loadError) => {
        if (active) {
          setError(
            getErrorMessage(loadError, 'Could not load your workspace.'),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshAll]);

  // Keep sidebar counts perfectly in sync with the local task list.
  const projectRows = useMemo(
    () =>
      projects.map((project) => {
        const projectTasks = tasks.filter(
          (task) => task.projectId === project.id,
        );
        return {
          ...project,
          taskCount: projectTasks.length,
          openTaskCount: projectTasks.filter((task) => task.status !== 'done')
            .length,
        };
      }),
    [projects, tasks],
  );

  const visibleTasks = useMemo(
    () =>
      selectedProjectId
        ? tasks.filter((task) => task.projectId === selectedProjectId)
        : tasks,
    [tasks, selectedProjectId],
  );

  const openCount = visibleTasks.filter((task) => task.status !== 'done').length;
  const doneCount = visibleTasks.filter((task) => task.status === 'done').length;
  const overdueCount = visibleTasks.filter(
    (task) => task.status !== 'done' && isOverdue(task.dueDate),
  ).length;

  const selectedProject = projectRows.find(
    (project) => project.id === selectedProjectId,
  );

  function openNewTask(status: TaskStatus = 'todo') {
    setTaskDialog({ open: true, task: null, status });
  }

  function openEditTask(task: Task) {
    setTaskDialog({ open: true, task, status: task.status });
  }

  function closeTaskDialog() {
    setTaskDialog((current) => ({ ...current, open: false }));
  }

  async function handleTaskSaved() {
    try {
      await refreshAll();
    } catch (refreshError) {
      setError(
        getErrorMessage(
          refreshError,
          'The task was saved, but the board could not refresh.',
        ),
      );
    }
  }

  async function handleProjectCreated(project: Project) {
    setSelectedProjectId(project.id);
    try {
      await refreshAll();
    } catch (refreshError) {
      setError(
        getErrorMessage(
          refreshError,
          'The project was created, but the list could not refresh.',
        ),
      );
    }
  }

  async function handleMove(task: Task, status: TaskStatus) {
    if (task.status === status) return;

    const previousTasks = tasks;
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? { ...item, status } : item,
      ),
    );

    try {
      const updated = await api.tasks.updateStatus(task.id, status);
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? updated : item)),
      );
    } catch (moveError) {
      setTasks(previousTasks);
      setError(getErrorMessage(moveError, 'Could not move the task.'));
    }
  }

  async function confirmDeleteTask() {
    if (!taskToDelete) return;
    const target = taskToDelete;

    setDeleting(true);
    try {
      await api.tasks.remove(target.id);
      setTasks((current) => current.filter((task) => task.id !== target.id));
      setTaskToDelete(null);
    } catch (deleteError) {
      setTaskToDelete(null);
      setError(getErrorMessage(deleteError, 'Could not delete the task.'));
    } finally {
      setDeleting(false);
    }
  }

  async function confirmDeleteProject() {
    if (!projectToDelete) return;
    const target = projectToDelete;

    setDeleting(true);
    try {
      await api.projects.remove(target.id);
      setProjects((current) => current.filter((project) => project.id !== target.id));
      setTasks((current) =>
        current.filter((task) => task.projectId !== target.id),
      );
      if (selectedProjectId === target.id) setSelectedProjectId(null);
      setProjectToDelete(null);
    } catch (deleteError) {
      setProjectToDelete(null);
      setError(getErrorMessage(deleteError, 'Could not delete the project.'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // The local session is cleared in the auth provider either way.
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <LogoMark className="h-9 w-9 animate-pulse" />
          <span>Loading your workspace…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        user={user}
        projects={projectRows}
        selectedProjectId={selectedProjectId}
        canDeleteProjects={projectRows.length > 1}
        onSelectProject={setSelectedProjectId}
        onNewProject={() => setProjectDialogOpen(true)}
        onDeleteProject={setProjectToDelete}
        onOpenProfile={() => setProfileDialogOpen(true)}
        onLogout={() => void handleLogout()}
      />

      <main className="min-w-0 flex-1">
        <MobileBar
          user={user}
          projects={projectRows}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
          onNewProject={() => setProjectDialogOpen(true)}
          onOpenProfile={() => setProfileDialogOpen(true)}
          onLogout={() => void handleLogout()}
        />

        <div className="mx-auto max-w-7xl px-5 pb-16 pt-7 sm:px-8 lg:px-10 lg:pt-10">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300/70">
                {formatHeaderDate()}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {greeting()}, {user.name.split(' ')[0]}.
              </h1>
              <p className="mt-1.5 text-sm text-slate-400">
                {selectedProject ? selectedProject.name : 'All projects'} ·{' '}
                {openCount} open {openCount === 1 ? 'task' : 'tasks'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openNewTask()}
              className="btn-primary"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New task
            </button>
          </header>

          {error && (
            <div
              role="alert"
              className="animate-fade-in mt-5 flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <p className="flex-1">{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-rose-300/70 transition hover:bg-rose-500/10 hover:text-rose-200"
                aria-label="Dismiss error"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="mt-7 grid grid-cols-3 gap-3 sm:max-w-2xl">
            <StatCard label="Open" value={openCount} icon={CircleDot} tone="indigo" />
            <StatCard
              label="Completed"
              value={doneCount}
              icon={CheckCircle2}
              tone="emerald"
            />
            <StatCard
              label="Overdue"
              value={overdueCount}
              icon={AlarmClock}
              tone={overdueCount > 0 ? 'rose' : 'slate'}
            />
          </div>

          <div className="mt-6 grid items-start gap-4 md:grid-cols-3">
            {COLUMNS.map((column) => {
              const columnTasks = visibleTasks
                .filter((task) => task.status === column.key)
                .sort(sortByDueDate);

              return (
                <section
                  key={column.key}
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-3"
                >
                  <header className="flex items-center justify-between px-1 pb-3 pt-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${column.dot}`}
                        aria-hidden="true"
                      />
                      <h2 className="text-sm font-semibold text-slate-200">
                        {column.label}
                      </h2>
                      <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-400">
                        {columnTasks.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openNewTask(column.key)}
                      className="icon-btn h-7 w-7"
                      title={`Add task to ${column.label}`}
                      aria-label={`Add task to ${column.label}`}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </header>

                  <div className="space-y-2.5">
                    {columnTasks.map((task, index) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        index={index}
                        showProject={selectedProjectId === null}
                        onEdit={openEditTask}
                        onDelete={setTaskToDelete}
                        onMove={(target, status) => void handleMove(target, status)}
                      />
                    ))}

                    {columnTasks.length === 0 && (
                      <button
                        type="button"
                        onClick={() => openNewTask(column.key)}
                        className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-white/10 px-3 py-8 text-xs text-slate-500 transition hover:border-indigo-400/30 hover:text-slate-300"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add a task
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {projectRows.length === 0 && (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-8 text-center">
              <p className="text-sm text-slate-400">
                You don&apos;t have any projects yet.
              </p>
              <button
                type="button"
                onClick={() => setProjectDialogOpen(true)}
                className="btn-primary mt-4"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create your first project
              </button>
            </div>
          )}
        </div>
      </main>

      <TaskModal
        open={taskDialog.open}
        task={taskDialog.task}
        projects={projectRows}
        defaultProjectId={selectedProjectId ?? projectRows[0]?.id}
        defaultStatus={taskDialog.status}
        onClose={closeTaskDialog}
        onSaved={handleTaskSaved}
      />

      <ProjectModal
        open={projectDialogOpen}
        onClose={() => setProjectDialogOpen(false)}
        onCreated={handleProjectCreated}
      />

      <ProfileModal
        open={profileDialogOpen}
        onClose={() => setProfileDialogOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(taskToDelete)}
        title="Delete task?"
        message={
          taskToDelete
            ? `"${taskToDelete.title}" will be permanently deleted. This can't be undone.`
            : ''
        }
        confirmLabel="Delete task"
        pending={deleting}
        onConfirm={() => void confirmDeleteTask()}
        onClose={() => {
          if (!deleting) setTaskToDelete(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(projectToDelete)}
        title="Delete project?"
        message={
          projectToDelete
            ? `Deleting "${projectToDelete.name}" also deletes its tasks. This can't be undone.`
            : ''
        }
        confirmLabel="Delete project"
        pending={deleting}
        onConfirm={() => void confirmDeleteProject()}
        onClose={() => {
          if (!deleting) setProjectToDelete(null);
        }}
      />
    </div>
  );
}
