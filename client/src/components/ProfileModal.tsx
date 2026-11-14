import { useEffect, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { api, getErrorMessage } from '../api';
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
  const { user, updateProfile } = useAuth();

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
      await updateProfile(trimmedName, trimmedEmail);
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
    </Modal>
  );
}
