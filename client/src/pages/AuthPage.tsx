import { useState, type FormEvent } from 'react';
import {
  Link,
  Navigate,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.223 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44c7.682 0 14.344-4.337 17.694-10.691 1.646-3.146 2.306-6.617 2.306-10.309 0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isLogin = mode === 'login';
  const { user, loading, googleEnabled, login, register, completeTwoFactor } =
    useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const oauth = searchParams.get('oauth');
  const googleTwoFactor = oauth === '2fa';

  const oauthError =
    oauth === 'cancelled'
      ? 'Google sign-in was cancelled.'
      : oauth === 'email-exists'
        ? 'An account with that email already exists. Sign in with your password, or use a different Google account.'
        : oauth === 'error'
          ? 'Google sign-in could not be completed. Please try again.'
          : oauth === 'unavailable'
            ? 'Google sign-in is not configured on this server yet.'
            : oauth === 'link-conflict'
              ? 'That email address is already linked to a different Google account.'
              : null;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(oauthError);
  const [submitting, setSubmitting] = useState(false);

  const [step, setStep] = useState<'credentials' | 'two-factor'>(
    googleTwoFactor ? 'two-factor' : 'credentials',
  );
  const [challengeToken, setChallengeToken] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Never bounce to the dashboard while the session is still being checked or
  // while the URL is reporting the result of a Google sign-in attempt. In both
  // cases the user must stay on the login page (a cancelled Google flow should
  // not reveal a previously authenticated view).
  if (user && !loading && !oauth) {
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
      await completeTwoFactor(challengeToken || null, code);
      navigate('/', { replace: true });
    } catch (submitError) {
      setCodeError(
        getErrorMessage(submitError, 'Could not verify that code. Try again.'),
      );
    } finally {
      setVerifying(false);
    }
  }

  function backToCredentials() {
    setStep('credentials');
    setChallengeToken('');
    setCode('');
    setCodeError(null);
    setError(null);

    // Drop the OAuth marker so a reload starts from the normal sign-in form.
    if (oauth) navigate('/login', { replace: true });
  }

  if (step === 'two-factor') {
    return (
      <AuthShell
        eyebrow="Two-step verification"
        title="Enter your code"
        description={
          googleTwoFactor
            ? 'Google verified your email. Enter the 6-digit code from Microsoft Authenticator or another authenticator app to finish signing in.'
            : 'Open Microsoft Authenticator or another authenticator app and enter the 6-digit code for Taskflow.'
        }
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

      {googleEnabled && (
        <div className="mt-7">
          <a
            href="/api/auth/google"
            aria-disabled={loading}
            onClick={(event) => {
              // Do not start OAuth before we know whether this browser is
              // already signed in; otherwise a cancelled attempt can reveal
              // the dashboard.
              if (loading) event.preventDefault();
            }}
            className={`btn-secondary w-full py-3 ${
              loading ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            <GoogleIcon />
            {isLogin ? 'Continue with Google' : 'Sign up with Google'}
          </a>
          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-white/[0.08]" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {isLogin ? 'or use email' : 'or sign up with email'}
            </span>
            <span className="h-px flex-1 bg-white/[0.08]" />
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={googleEnabled ? 'space-y-4' : 'mt-7 space-y-4'}
      >
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
