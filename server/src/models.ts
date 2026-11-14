export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  email_verified: number;
  totp_secret: string | null;
  totp_enabled: number;
  totp_last_step: number | null;
  created_at: string;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  task_count?: number;
  open_task_count?: number;
}

export interface TaskRow {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  created_at: string;
  updated_at: string;
  project_name?: string;
  project_color?: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.email_verified === 1,
    twoFactorEnabled: row.totp_enabled === 1,
    createdAt: row.created_at,
  };
}

export function toProject(row: ProjectRow) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    taskCount: Number(row.task_count ?? 0),
    openTaskCount: Number(row.open_task_count ?? 0),
  };
}

export function toTask(row: TaskRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name ?? '',
    projectColor: row.project_color ?? '#6366f1',
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
