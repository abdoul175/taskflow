import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { getErrorMessage } from '../api';
import { useAuth } from '../auth';
import { LogoMark } from '../components/Logo';

const DEMO_EMAIL = 'demo@taskflow.dev';
const DEMO_PASSWORD = 'taskflow123';

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

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isLogin = mode === 'login';
  const { user, login, register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      navigate('/', { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Could not sign you in. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemoCredentials() {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

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
              {isLogin ? 'Welcome back' : 'Get started'}
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              {isLogin ? 'Sign in to Taskflow' : 'Create your account'}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {isLogin
                ? 'Pick up right where you left off.'
                : 'Your first project is created automatically.'}
            </p>

            {error && (
              <div
                role="alert"
                className="animate-fade-in mt-6 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-300"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              {!isLogin && (
                <div>
                  <label htmlFor="name" className="label">
                    Name
                  </label>
                  <div className="relative">
                    <UserRound
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                      aria-hidden="true"
                    />
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      autoComplete="name"
                      autoFocus
                      placeholder="Alex Morgan"
                      className="input pl-10"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="email" className="label">
                  Email
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    autoFocus={isLogin}
                    placeholder="you@example.com"
                    className="input pl-10"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="label">
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={isLogin ? 1 : 8}
                    maxLength={128}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    placeholder={isLogin ? 'Your password' : 'At least 8 characters'}
                    className="input px-10"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full py-3"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <>
                    {isLogin ? 'Sign in' : 'Create account'}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            {isLogin && (
              <div className="mt-5 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-300">
                      Just exploring?
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {DEMO_EMAIL} · {DEMO_PASSWORD}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={fillDemoCredentials}
                    className="shrink-0 text-xs font-semibold text-indigo-300 transition hover:text-indigo-200"
                  >
                    Use demo
                  </button>
                </div>
              </div>
            )}

            <p className="mt-6 text-center text-sm text-slate-500">
              {isLogin ? 'New here?' : 'Already have an account?'}{' '}
              <Link
                to={isLogin ? '/register' : '/login'}
                className="font-semibold text-indigo-300 transition hover:text-indigo-200"
              >
                {isLogin ? 'Create an account' : 'Sign in'}
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
