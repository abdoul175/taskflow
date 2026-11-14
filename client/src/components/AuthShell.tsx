import type { ReactNode } from 'react';
import {
  Layers,
  ShieldCheck,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { LogoMark } from './Logo';

function Feature({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-indigo-300">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      {children}
    </li>
  );
}

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: AuthShellProps) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-white/[0.06] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-24 top-1/4 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
          <div className="absolute -bottom-20 -right-16 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]" />
        </div>

        <div className="relative flex items-center gap-3">
          <LogoMark />
          <span className="text-lg font-semibold tracking-tight text-white">
            Taskflow
          </span>
        </div>

        <div className="relative max-w-lg">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-indigo-200">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            A calmer way to ship work
          </span>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.04] tracking-tight text-white xl:text-6xl">
            Plan less.
            <br />
            <span className="bg-gradient-to-r from-indigo-300 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
              Finish more.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-slate-400">
            Taskflow keeps your projects, priorities, and due dates in one quiet
            place — so you can spend your energy on the work itself.
          </p>
          <ul className="mt-8 space-y-3.5 text-sm text-slate-300">
            <Feature icon={Layers}>Projects and tasks, beautifully organized</Feature>
            <Feature icon={Target}>Priorities and due dates that stay visible</Feature>
            <Feature icon={ShieldCheck}>Private by default — your data is yours</Feature>
          </ul>
        </div>

        <p className="relative text-xs text-slate-600">
          © {new Date().getFullYear()} Taskflow. Built for focused work.
        </p>
      </aside>

      <main className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <LogoMark />
            <span className="text-lg font-semibold tracking-tight text-white">
              Taskflow
            </span>
          </div>

          <div className="animate-rise">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300/80">
              {eyebrow}
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              {title}
            </h2>
            <p className="mt-2 text-sm text-slate-400">{description}</p>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
