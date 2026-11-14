import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  Send,
} from 'lucide-react';
import { api, getErrorMessage, type ForgotPasswordResponse } from '../api';
import { AuthShell } from '../components/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<ForgotPasswordResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await api.auth.forgotPassword(email);
      setSent(result);
    } catch (submitError) {
      setError(
        getErrorMessage(
          submitError,
          'Could not request a reset link. Please try again.',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Password help"
      title="Forgot your password?"
      description="Enter the email tied to your account and we'll send you a reset link."
    >
      {error && (
        <div
          role="alert"
          className="animate-fade-in mt-6 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-300"
        >
          {error}
        </div>
      )}

      {sent ? (
        <div className="mt-7 space-y-4">
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-300"
          >
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <p>{sent.message}</p>
          </div>

          {sent.devResetUrl && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-200">
              <p className="font-semibold">Development mode</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
                No SMTP server is configured, so the email was printed to the
                server console. You can also open the reset link directly.
              </p>
              <a
                href={sent.devResetUrl}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-100 underline underline-offset-2 hover:text-white"
              >
                Open reset link
              </a>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSent(null)}
            className="btn-secondary w-full"
          >
            Send another link
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div>
            <label htmlFor="reset-email" className="label">
              Email
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                aria-hidden="true"
              />
              <input
                id="reset-email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                className="input pl-10"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
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
                Send reset link
                <Send className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </form>
      )}

      <Link
        to="/login"
        className="mt-6 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-300"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to sign in
      </Link>
    </AuthShell>
  );
}
