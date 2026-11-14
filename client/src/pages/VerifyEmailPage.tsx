import { useState, type FormEvent } from 'react';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  LogOut,
  MailCheck,
  RotateCw,
} from 'lucide-react';
import { getErrorMessage } from '../api';
import { useAuth } from '../auth';
import { AuthShell } from '../components/AuthShell';

interface VerifyLocationState {
  email?: string;
  devCode?: string;
}

export default function VerifyEmailPage() {
  const { user, verifyEmail, resendVerification, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const state = (location.state ?? {}) as VerifyLocationState;

  const email = state.email ?? searchParams.get('email') ?? user?.email ?? '';

  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(state.devCode);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentMessage, setResentMessage] = useState<string | null>(null);

  if (user?.emailVerified && !state.email) {
    return <Navigate to="/" replace />;
  }

  if (!email) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await verifyEmail(email, code.trim());
      navigate('/', { replace: true });
    } catch (submitError) {
      setError(
        getErrorMessage(
          submitError,
          'Could not verify that code. Please try again.',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResentMessage(null);
    setResending(true);

    try {
      const result = await resendVerification(email);
      setDevCode(result.devCode);
      setResentMessage(result.message);
    } catch (resendError) {
      setError(
        getErrorMessage(
          resendError,
          'Could not send a new code. Please try again.',
        ),
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
      eyebrow="One more step"
      title="Verify your email"
      description={
        <>
          We sent a 6-digit code to{' '}
          <span className="font-medium text-slate-200">{email}</span>.
        </>
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

      {devCode && (
        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-200">
          <p className="font-semibold">Development mode</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
            No SMTP server is configured. Your verification code is:
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-[0.35em] text-amber-100">
            {devCode}
          </p>
        </div>
      )}

      {resentMessage && !devCode && (
        <div
          role="status"
          className="mt-6 flex items-start gap-2.5 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-3.5 py-3 text-sm text-indigo-200"
        >
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{resentMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-7 space-y-4">
        <div>
          <label htmlFor="verification-code" className="label">
            Verification code
          </label>
          <input
            id="verification-code"
            type="text"
            required
            minLength={6}
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            className="input py-3 text-center font-mono text-2xl tracking-[0.4em]"
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
            }
          />
        </div>

        <button
          type="submit"
          disabled={submitting || code.length !== 6}
          className="btn-primary w-full py-3"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <>
              Verify email
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </button>
      </form>

      <button
        type="button"
        onClick={() => void handleResend()}
        disabled={resending}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-indigo-300 transition hover:bg-white/[0.04] hover:text-indigo-200 disabled:pointer-events-none disabled:opacity-50"
      >
        {resending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <RotateCw className="h-4 w-4" aria-hidden="true" />
        )}
        Send a new code
      </button>

      {user ? (
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-2 flex w-full items-center justify-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-300"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      ) : (
        <Link
          to="/login"
          className="mt-2 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to sign in
        </Link>
      )}
    </AuthShell>
  );
}
