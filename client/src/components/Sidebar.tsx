import { ListTodo, LogOut, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Project, User } from '../types';
import { LogoMark } from './Logo';

interface SidebarProps {
  user: User;
  projects: Project[];
  selectedProjectId: string | null;
  canDeleteProjects: boolean;
  onSelectProject: (projectId: string | null) => void;
  onNewProject: () => void;
  onDeleteProject: (project: Project) => void;
  onOpenProfile: () => void;
  onLogout: () => void;
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

export function Sidebar({
  user,
  projects,
  selectedProjectId,
  canDeleteProjects,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onOpenProfile,
  onLogout,
}: SidebarProps) {
  const openTotal = projects.reduce(
    (total, project) => total + project.openTaskCount,
    0,
  );

  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-white/[0.06] bg-[#080d18]/70 px-4 py-6 backdrop-blur lg:flex">
      <div className="flex items-center gap-3 px-2">
        <LogoMark className="h-8 w-8" />
        <div>
          <p className="text-sm font-semibold tracking-tight text-white">
            Taskflow
          </p>
          <p className="text-[11px] text-slate-600">Focus, organized.</p>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between px-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Projects
        </span>
        <button
          type="button"
          onClick={onNewProject}
          className="icon-btn h-7 w-7"
          title="New project"
          aria-label="New project"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <nav className="mt-2 flex-1 space-y-1 overflow-y-auto pr-1">
        <button
          type="button"
          onClick={() => onSelectProject(null)}
          className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition ${
            selectedProjectId === null
              ? 'bg-white/[0.08] text-white'
              : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
          }`}
        >
          <ListTodo
            className="h-4 w-4 shrink-0 text-indigo-300"
            aria-hidden="true"
          />
          <span className="flex-1 truncate font-medium">All tasks</span>
          <span className="text-xs tabular-nums text-slate-500">
            {openTotal}
          </span>
        </button>

        {projects.map((project) => {
          const active = selectedProjectId === project.id;

          return (
            <div
              key={project.id}
              className={`group flex items-center rounded-xl transition ${
                active
                  ? 'bg-white/[0.08]'
                  : 'hover:bg-white/[0.04]'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectProject(project.id)}
                className={`flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left text-sm transition ${
                  active
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate font-medium">{project.name}</span>
                <span className="text-xs tabular-nums text-slate-500">
                  {project.openTaskCount}
                </span>
              </button>

              {canDeleteProjects && (
                <button
                  type="button"
                  onClick={() => onDeleteProject(project)}
                  className="mr-2 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-600 opacity-0 transition hover:bg-white/10 hover:text-rose-300 focus-visible:opacity-100 group-hover:opacity-100"
                  title="Delete project"
                  aria-label={`Delete project ${project.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={onNewProject}
          className="mt-1 flex w-full items-center gap-2.5 rounded-xl border border-dashed border-white/[0.08] px-3 py-2.5 text-left text-sm text-slate-500 transition hover:border-indigo-400/30 hover:text-slate-300"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New project
        </button>
      </nav>

      <div className="mt-6 flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
        <button
          type="button"
          onClick={onOpenProfile}
          className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
          title="Edit profile"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-[11px] font-bold text-white">
            {initials(user.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-200">
              {user.name}
            </span>
            <span className="block truncate text-xs text-slate-500">
              {user.email}
            </span>
          </span>
          <Pencil
            className="h-3.5 w-3.5 shrink-0 text-slate-600 transition group-hover:text-slate-400"
            aria-hidden="true"
          />
          <span className="sr-only">Edit profile</span>
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="icon-btn h-8 w-8 shrink-0"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
