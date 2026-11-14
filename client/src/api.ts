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

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
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
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new ApiError(
      data?.error ?? 'Something went wrong. Please try again.',
      response.status,
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

export const api = {
  auth: {
    me: () => request<{ user: User }>('/auth/me').then((data) => data.user),
    login: (email: string, password: string) =>
      request<{ user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }).then((data) => data.user),
    register: (name: string, email: string, password: string) =>
      request<{ user: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      }).then((data) => data.user),
    updateProfile: (name: string, email: string) =>
      request<{ user: User }>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, email }),
      }).then((data) => data.user),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<void>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
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
