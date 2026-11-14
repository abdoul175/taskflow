import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { ApiError, getErrorMessage } from '../api';
import { useAuth } from '../auth';
import { AuthShell } from '../components/AuthShell';

const DEMO_EMAIL = 'demo@taskflow.dev';
const DEMO_PASSWORD = 'taskflow123';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isLogin = mode === 'login';
  const { user, login, register, completeTwoFactor } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [step, setStep] = useState<'credentials' | 'two-factor'>('credentials');
  const [challengeToken, setChallengeToken] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (isLogin) {
        const result = await login(email, password);

        if (result.status === 'two-factor') {
          setChallengeToken(result.challengeToken);
          setCode('');
          setCodeError(null);
          setStep('two-factor');
          return;
        }

        navigate('/', { replace: true });
      } else {
        const result = await register(name, email, password);
        navigate('/verify-email', {
          state: { email: result.email, devCode: result.devCode },
        });
      }
    } catch (submitError) {
      if (
        isLogin &&
        submitError instanceof ApiError &&
        submitError.code === 'email_not_verified'
      ) {
        const payload = submitError.payload as { email?: string } | null;
        navigate('/verify-email', {
          state: { email: payload?.email ?? email },
        });
        return;
      }

      setError(
        getErrorMessage(
          submitError,
          isLogin
            ? 'Could not sign you in. Please try again.'
            : 'Could not create your account. Please try again.',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTwoFactorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCodeError(null);
    setVerifying(true);

    try {
      await completeTwoFactor(challengeToken, code);
      navigate('/', { replace: true });
    } catch (submitError) {
      setCodeError(
        getErrorMessage(submitError, 'Could not verify that code. Try again.'),
      );
    } finally {
      setVerifying(false);
    }
  }

  function fillDemoCredentials() {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  function backToCredentials() {
    setStep('credentials');
    setChallengeToken('');
    setCode('');
    setCodeError(null);
  }

  if (step === 'two-factor') {
    return (
      <AuthShell
        eyebrow="Two-step verification"
        title="Enter your code"
        description="Open your authenticator app and enter the 6-digit code for Taskflow."
      >
        {codeError && (
          <div
            role="alert"
            className="animate-fade-in mt-6 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-300"
          >
            {codeError}
          </div>
        )}

        <form onSubmit={handleTwoFactorSubmit} className="mt-7 space-y-4">
          <div>
            <label htmlFor="two-factor-code" className="label">
              Authentication code
            </label>
            <div className="relative">
              <ShieldCheck
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                aria-hidden="true"
              />
              <input
                id="two-factor-code"
                type="text"
                required
                minLength={6}
                maxLength={20}
                autoComplete="one-time-code"
                autoFocus
                placeholder="123456"
                className="input pl-10 text-center font-mono text-lg tracking-[0.3em]"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              You can also enter one of your saved recovery codes.
            </p>
          </div>

          <button
            type="submit"
            disabled={verifying || code.trim().length < 6}
            className="btn-primary w-full py-3"
          >
            {verifying ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <>
                Verify and sign in
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        <button
          type="button"
          onClick={backToCredentials}
          className="mt-6 flex w-full items-center justify-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to sign in
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={isLogin ? 'Welcome back' : 'Get started'}
      title={isLogin ? 'Sign in to Taskflow' : 'Create your account'}
      description={
        isLogin
          ? 'Pick up right where you left off.'
          : 'We will email you a 6-digit code to verify your address.'
      }
    >
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
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label
              htmlFor="password"
              className="text-xs font-semibold uppercase tracking-wider text-slate-400"
            >
              Password
            </label>
            {isLogin && (
              <Link
                to="/forgot-password"
                className="text-xs font-semibold text-indigo-300 transition hover:text-indigo-200"
              >
                Forgot password?
              </Link>
            )}
          </div>
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
    </AuthShell>
  );
}
