import { useEffect, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { api, getErrorMessage, type TwoFactorSetupResponse } from '../api';
import { useAuth } from '../auth';
import { Modal } from './Modal';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
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

/**
 * Copy text with the Clipboard API, falling back to a hidden textarea for
 * browsers or origins (such as plain-HTTP LAN addresses) where it is blocked.
 */
async function copyToClipboard(value: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the selection-based copy.
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const succeeded = document.execCommand('copy');
    document.body.removeChild(textarea);
    return succeeded;
  } catch {
    return false;
  }
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  minLength: number;
  autoComplete: string;
  placeholder: string;
  onChange: (value: string) => void;
}

function PasswordField({
  id,
  label,
  value,
  minLength,
  autoComplete,
  placeholder,
  onChange,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <Lock
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          aria-hidden="true"
        />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required
          minLength={minLength}
          maxLength={128}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="input px-10"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

function SuccessMessage({ children }: { children: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-300"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </div>
  );
}

export function ProfileModal({ open, onClose }: ProfileModalProps) {
  const { user, updateProfile, refreshUser } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [twoFactorSaved, setTwoFactorSaved] = useState<string | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetupResponse | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [codesCopied, setCodesCopied] = useState(false);
  const [setupKeyCopied, setSetupKeyCopied] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');

  // Reset the forms each time the dialog is opened.
  useEffect(() => {
    if (!open) return;

    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setProfileError(null);
    setProfileSaved(false);

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setPasswordSaved(false);

    setTwoFactorBusy(false);
    setTwoFactorError(null);
    setTwoFactorSaved(null);
    setSetup(null);
    setSetupCode('');
    setRecoveryCodes(null);
    setCodesCopied(false);
    setSetupKeyCopied(false);
    setDisableOpen(false);
    setDisablePassword('');
    setDisableCode('');
  }, [open]);

  const profileDirty =
    user !== null &&
    (name.trim() !== user.name ||
      email.trim().toLowerCase() !== user.email.toLowerCase());

  const memberSince = user
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })
    : '';

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setProfileError('Enter your name.');
      return;
    }
    if (!trimmedEmail) {
      setProfileError('Enter your email address.');
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);

    try {
      const result = await updateProfile(trimmedName, trimmedEmail);

      if (result.verificationRequired) {
        // The new address must be verified; ProtectedRoute sends the user to
        // the verification screen right away.
        onClose();
        return;
      }

      setName(trimmedName);
      setEmail(trimmedEmail.toLowerCase());
      setProfileSaved(true);
    } catch (saveError) {
      setProfileError(
        getErrorMessage(saveError, 'Could not update your profile.'),
      );
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('Choose a password different from your current one.');
      return;
    }

    setPasswordSaving(true);

    try {
      await api.auth.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSaved(true);
    } catch (saveError) {
      setPasswordError(
        getErrorMessage(saveError, 'Could not change your password.'),
      );
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleStartTwoFactor() {
    setTwoFactorBusy(true);
    setTwoFactorError(null);
    setTwoFactorSaved(null);

    try {
      const data = await api.auth.startTwoFactorSetup();
      setSetup(data);
      setSetupCode('');
      setSetupKeyCopied(false);
    } catch (setupError) {
      setTwoFactorError(
        getErrorMessage(
          setupError,
          'Could not start two-factor setup. Please try again.',
        ),
      );
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function handleEnableTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTwoFactorBusy(true);
    setTwoFactorError(null);

    try {
      const result = await api.auth.enableTwoFactor(setupCode.trim());
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null);
      setSetupCode('');
      setCodesCopied(false);
      setSetupKeyCopied(false);
      await refreshUser();
      setTwoFactorSaved('Two-factor authentication is now on.');
    } catch (enableError) {
      setTwoFactorError(
        getErrorMessage(enableError, 'Could not enable two-factor authentication.'),
      );
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function handleDisableTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTwoFactorBusy(true);
    setTwoFactorError(null);
    setTwoFactorSaved(null);

    try {
      await api.auth.disableTwoFactor(disablePassword, disableCode.trim());
      await refreshUser();
      setDisableOpen(false);
      setDisablePassword('');
      setDisableCode('');
      setTwoFactorSaved('Two-factor authentication is now off.');
    } catch (disableError) {
      setTwoFactorError(
        getErrorMessage(
          disableError,
          'Could not disable two-factor authentication.',
        ),
      );
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function handleCopyRecoveryCodes() {
    if (!recoveryCodes) return;

    if (!(await copyToClipboard(recoveryCodes.join('\n')))) {
      setTwoFactorError(
        'Could not copy the codes. Select and copy them manually.',
      );
      return;
    }

    setCodesCopied(true);
  }

  async function handleCopySetupKey() {
    if (!setup) return;

    if (!(await copyToClipboard(setup.secret))) {
      setTwoFactorError(
        'Could not copy the setup key. Select and copy it manually.',
      );
      return;
    }

    setSetupKeyCopied(true);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Profile"
      description="Update how you appear and how you sign in."
    >
      {user && (
        <div className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-base font-bold text-white">
            {initials(user.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {user.name}
            </p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            {user.googleConnected && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-300">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Google account connected
              </p>
            )}
            <p className="mt-1 text-[11px] text-slate-600">
              Member since {memberSince}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleProfileSubmit} className="mt-5 space-y-4">
        <div className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-indigo-300" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-200">
            Account details
          </h3>
        </div>

        <div>
          <label htmlFor="profile-name" className="label">
            Name
          </label>
          <div className="relative">
            <UserRound
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <input
              id="profile-name"
              type="text"
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              placeholder="Alex Morgan"
              className="input pl-10"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setProfileSaved(false);
              }}
            />
          </div>
        </div>

        <div>
          <label htmlFor="profile-email" className="label">
            Email
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <input
              id="profile-email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              placeholder="you@example.com"
              className="input pl-10"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setProfileSaved(false);
              }}
            />
          </div>
        </div>

        {profileError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300"
          >
            {profileError}
          </div>
        )}

        {profileSaved && <SuccessMessage>Profile updated.</SuccessMessage>}

        <div className="flex justify-end">
          <button
            type="submit"
            className="btn-primary"
            disabled={profileSaving || !profileDirty}
          >
            {profileSaving && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Save changes
          </button>
        </div>
      </form>

      <div className="my-6 h-px bg-white/[0.06]" aria-hidden="true" />

      <form onSubmit={handlePasswordSubmit} className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck
            className="h-4 w-4 text-indigo-300"
            aria-hidden="true"
          />
          <h3 className="text-sm font-semibold text-slate-200">
            Change password
          </h3>
        </div>

        <PasswordField
          id="current-password"
          label="Current password"
          value={currentPassword}
          minLength={1}
          autoComplete="current-password"
          placeholder="Your current password"
          onChange={(value) => {
            setCurrentPassword(value);
            setPasswordSaved(false);
          }}
        />

        <PasswordField
          id="new-password"
          label="New password"
          value={newPassword}
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          onChange={(value) => {
            setNewPassword(value);
            setPasswordSaved(false);
          }}
        />

        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          value={confirmPassword}
          minLength={8}
          autoComplete="new-password"
          placeholder="Repeat the new password"
          onChange={(value) => {
            setConfirmPassword(value);
            setPasswordSaved(false);
          }}
        />

        {passwordError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300"
          >
            {passwordError}
          </div>
        )}

        {passwordSaved && (
          <SuccessMessage>
            Password updated. Other devices were signed out.
          </SuccessMessage>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="btn-secondary"
            disabled={
              passwordSaving ||
              !currentPassword ||
              !newPassword ||
              !confirmPassword
            }
          >
            {passwordSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Lock className="h-4 w-4" aria-hidden="true" />
            )}
            Update password
          </button>
        </div>
      </form>

      <div className="my-6 h-px bg-white/[0.06]" aria-hidden="true" />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck
              className="h-4 w-4 text-indigo-300"
              aria-hidden="true"
            />
            <h3 className="text-sm font-semibold text-slate-200">
              Two-factor authentication
            </h3>
          </div>
          <span
            className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
              user?.twoFactorEnabled
                ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                : 'border-white/10 bg-white/[0.04] text-slate-500'
            }`}
          >
            {user?.twoFactorEnabled ? 'Enabled' : 'Off'}
          </span>
        </div>

        {recoveryCodes ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
            <p className="text-sm font-semibold text-amber-200">
              Save your recovery codes
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-200/70">
              Each code works once if you lose access to your authenticator
              app. This is the only time they will be shown.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {recoveryCodes.map((recovery) => (
                <code
                  key={recovery}
                  className="rounded-lg border border-amber-500/15 bg-black/25 px-2.5 py-1.5 text-center font-mono text-xs tracking-wider text-amber-100"
                >
                  {recovery}
                </code>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => void handleCopyRecoveryCodes()}
                className="btn-ghost px-2.5 py-1.5 text-xs"
              >
                {codesCopied ? (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {codesCopied ? 'Copied' : 'Copy codes'}
              </button>
              <button
                type="button"
                onClick={() => setRecoveryCodes(null)}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                I saved them
              </button>
            </div>
          </div>
        ) : user?.twoFactorEnabled ? (
          <>
            <p className="text-sm leading-relaxed text-slate-400">
              Signing in requires a code from your authenticator app or one of
              your recovery codes.
            </p>

            {twoFactorError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300"
              >
                {twoFactorError}
              </div>
            )}

            {twoFactorSaved && <SuccessMessage>{twoFactorSaved}</SuccessMessage>}

            {disableOpen ? (
              <form
                onSubmit={handleDisableTwoFactor}
                className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5"
              >
                <PasswordField
                  id="disable-2fa-password"
                  label="Password"
                  value={disablePassword}
                  minLength={1}
                  autoComplete="current-password"
                  placeholder="Your password"
                  onChange={setDisablePassword}
                />
                <div>
                  <label htmlFor="disable-2fa-code" className="label">
                    Authentication code
                  </label>
                  <input
                    id="disable-2fa-code"
                    type="text"
                    required
                    minLength={6}
                    maxLength={20}
                    autoComplete="one-time-code"
                    placeholder="123456 or recovery code"
                    className="input text-center font-mono tracking-[0.2em]"
                    value={disableCode}
                    onChange={(event) => setDisableCode(event.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn-secondary px-3 py-2 text-xs"
                    onClick={() => {
                      setDisableOpen(false);
                      setDisablePassword('');
                      setDisableCode('');
                      setTwoFactorError(null);
                    }}
                    disabled={twoFactorBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-danger px-3 py-2 text-xs"
                    disabled={
                      twoFactorBusy || !disablePassword || disableCode.length < 6
                    }
                  >
                    {twoFactorBusy && (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    Turn off 2FA
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setDisableOpen(true)}
                className="btn-secondary"
              >
                Turn off 2FA
              </button>
            )}
          </>
        ) : setup ? (
          <>
            <p className="text-sm leading-relaxed text-slate-400">
              Scan this QR code with{' '}
              <span className="font-medium text-slate-300">
                Microsoft Authenticator
              </span>
              . In the app, tap <strong className="text-slate-300">+</strong>,
              choose <strong className="text-slate-300">Other account</strong>,
              then scan. Google Authenticator, 1Password, Authy, and other TOTP
              apps also work.
            </p>

            <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 sm:flex-row">
              <img
                src={setup.qrDataUrl}
                alt="QR code for adding Taskflow to Microsoft Authenticator"
                className="h-40 w-40 shrink-0 self-center rounded-lg bg-white p-1"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    Can&apos;t scan? Enter this setup key manually:
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopySetupKey()}
                    className="btn-ghost shrink-0 px-2 py-1 text-[11px]"
                  >
                    {setupKeyCopied ? (
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3 w-3" aria-hidden="true" />
                    )}
                    {setupKeyCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <code className="mt-1 block break-all rounded-lg border border-white/[0.06] bg-black/30 px-2.5 py-2 font-mono text-[11px] leading-relaxed tracking-wider text-slate-300">
                  {setup.secret}
                </code>

                <form onSubmit={handleEnableTwoFactor} className="mt-3 space-y-2">
                  <label htmlFor="enable-2fa-code" className="label">
                    6-digit code
                  </label>
                  <input
                    id="enable-2fa-code"
                    type="text"
                    required
                    minLength={6}
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    className="input text-center font-mono text-lg tracking-[0.3em]"
                    value={setupCode}
                    onChange={(event) =>
                      setSetupCode(
                        event.target.value.replace(/\D/g, '').slice(0, 6),
                      )
                    }
                  />
                  <button
                    type="submit"
                    className="btn-primary w-full"
                    disabled={twoFactorBusy || setupCode.length !== 6}
                  >
                    {twoFactorBusy ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    )}
                    Verify and enable
                  </button>
                </form>
              </div>
            </div>

            {twoFactorError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300"
              >
                {twoFactorError}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setSetup(null);
                setSetupCode('');
                setSetupKeyCopied(false);
                setTwoFactorError(null);
              }}
              className="btn-ghost px-2.5 py-1.5 text-xs"
              disabled={twoFactorBusy}
            >
              Cancel setup
            </button>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-slate-400">
              Add a second step at sign-in with an authenticator app. You will
              also get one-time recovery codes.
            </p>

            {twoFactorError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300"
              >
                {twoFactorError}
              </div>
            )}

            {twoFactorSaved && <SuccessMessage>{twoFactorSaved}</SuccessMessage>}

            <button
              type="button"
              onClick={() => void handleStartTwoFactor()}
              className="btn-secondary"
              disabled={twoFactorBusy}
            >
              {twoFactorBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
              Set up 2FA
            </button>
          </>
        )}
      </section>
    </Modal>
  );
}
