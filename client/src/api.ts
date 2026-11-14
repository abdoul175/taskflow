import type {
  Project,
  ProjectInput,
  Task,
  TaskInput,
  TaskStatus,
  User,
} from './types';

export class ApiError extends Error {
  status: number;
  code?: string;
  payload?: unknown;

  constructor(message: string, status: number, code?: string, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('Cannot reach the server. Is it running?', 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json().catch(() => null)) as
    | { error?: string; code?: string; [key: string]: unknown }
    | null;

  if (!response.ok) {
    throw new ApiError(
      data?.error ?? 'Something went wrong. Please try again.',
      response.status,
      data?.code,
      data,
    );
  }

  return data as T;
}

export function getErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  return error instanceof ApiError ? error.message : fallback;
}

export interface LoginResponse {
  requires2fa?: boolean;
  challengeToken?: string;
  user?: User;
}

export interface RegisterResponse {
  verificationRequired: true;
  email: string;
  devCode?: string;
}

export interface VerificationResponse {
  ok: true;
  message: string;
  devCode?: string;
}

export interface ForgotPasswordResponse {
  ok: true;
  message: string;
  devResetUrl?: string;
}

export interface ProfileResponse {
  user: User;
  verificationRequired?: boolean;
  devCode?: string;
}

export interface TwoFactorSetupResponse {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

export const api = {
  auth: {
    me: () => request<{ user: User }>('/auth/me').then((data) => data.user),
    login: (email: string, password: string) =>
      request<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    loginTwoFactor: (challengeToken: string, code: string) =>
      request<{ user: User }>('/auth/login/2fa', {
        method: 'POST',
        body: JSON.stringify({ challengeToken, code }),
      }).then((data) => data.user),
    register: (name: string, email: string, password: string) =>
      request<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      }),
    verifyEmail: (email: string, code: string) =>
      request<{ user: User }>('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      }).then((data) => data.user),
    resendVerification: (email: string) =>
      request<VerificationResponse>('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    forgotPassword: (email: string) =>
      request<ForgotPasswordResponse>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    resetPassword: (token: string, password: string) =>
      request<void>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      }),
    updateProfile: (name: string, email: string) =>
      request<ProfileResponse>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, email }),
      }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<void>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    startTwoFactorSetup: () =>
      request<TwoFactorSetupResponse>('/auth/2fa/setup', { method: 'POST' }),
    enableTwoFactor: (code: string) =>
      request<{ recoveryCodes: string[] }>('/auth/2fa/enable', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    disableTwoFactor: (password: string, code: string) =>
      request<void>('/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ password, code }),
      }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
  },
  projects: {
    list: () =>
      request<{ projects: Project[] }>('/projects').then((data) => data.projects),
    create: (input: ProjectInput) =>
      request<{ project: Project }>('/projects', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((data) => data.project),
    update: (id: string, input: Partial<ProjectInput>) =>
      request<{ project: Project }>(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((data) => data.project),
    remove: (id: string) =>
      request<void>(`/projects/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    list: () =>
      request<{ tasks: Task[] }>('/tasks').then((data) => data.tasks),
    listByProject: (projectId: string) =>
      request<{ tasks: Task[] }>(
        `/tasks?projectId=${encodeURIComponent(projectId)}`,
      ).then((data) => data.tasks),
    create: (input: TaskInput) =>
      request<{ task: Task }>('/tasks', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((data) => data.task),
    update: (id: string, input: Partial<TaskInput>) =>
      request<{ task: Task }>(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((data) => data.task),
    updateStatus: (id: string, status: TaskStatus) =>
      request<{ task: Task }>(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }).then((data) => data.task),
    remove: (id: string) =>
      request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  },
};
