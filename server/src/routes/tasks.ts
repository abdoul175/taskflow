import { Router } from 'express';
import { z } from 'zod';
import { db, newId } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { toTask, type TaskRow } from '../models.js';

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

const statusSchema = z.enum(['todo', 'in_progress', 'done']);
const prioritySchema = z.enum(['low', 'medium', 'high']);

const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid due date.')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'Use a valid due date.')
  .nullable();

const createTaskSchema = z.object({
  projectId: z.string().min(1, 'Choose a project.'),
  title: z
    .string()
    .trim()
    .min(1, 'Give the task a title.')
    .max(200, 'Title is too long.'),
  description: z.string().trim().max(2000, 'Description is too long.').optional().default(''),
  status: statusSchema.optional().default('todo'),
  priority: prioritySchema.optional().default('medium'),
  dueDate: dueDateSchema.optional().default(null),
});

const updateTaskSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    title: z.string().trim().min(1, 'Title cannot be empty.').max(200).optional(),
    description: z.string().trim().max(2000, 'Description is too long.').optional(),
    status: statusSchema.optional(),
    priority: prioritySchema.optional(),
    dueDate: dueDateSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Nothing to update.',
  });

const taskSelect = `
  SELECT t.*, p.name AS project_name, p.color AS project_color
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
`;

async function ownsProject(userId: string, projectId: string): Promise<boolean> {
  const row = await db.get<{ id: string }>(
    'SELECT id FROM projects WHERE id = ? AND user_id = ?',
    [projectId, userId],
  );
  return Boolean(row);
}

async function getTask(userId: string, taskId: string): Promise<TaskRow | undefined> {
  return db.get<TaskRow>(`${taskSelect} WHERE t.id = ? AND t.user_id = ?`, [
    taskId,
    userId,
  ]);
}

tasksRouter.get('/', async (req, res) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;

  const rows = projectId
    ? await db.all<TaskRow>(
        `${taskSelect} WHERE t.user_id = ? AND t.project_id = ? ORDER BY t.created_at DESC`,
        [req.user!.id, projectId],
      )
    : await db.all<TaskRow>(
        `${taskSelect} WHERE t.user_id = ? ORDER BY t.created_at DESC`,
        [req.user!.id],
      );

  res.json({ tasks: rows.map(toTask) });
});

tasksRouter.post('/', async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const { projectId, title, description, status, priority, dueDate } = parsed.data;

  if (!(await ownsProject(req.user!.id, projectId))) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  const now = new Date().toISOString();
  const id = newId();

  await db.run(
    `INSERT INTO tasks
       (id, user_id, project_id, title, description, status, priority, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.user!.id,
      projectId,
      title,
      description,
      status,
      priority,
      dueDate,
      now,
      now,
    ],
  );

  res.status(201).json({ task: toTask((await getTask(req.user!.id, id))!) });
});

tasksRouter.patch('/:id', async (req, res) => {
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const existing = await getTask(req.user!.id, req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }

  const data = parsed.data;

  if (data.projectId && !(await ownsProject(req.user!.id, data.projectId))) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (data.projectId !== undefined) {
    updates.push('project_id = ?');
    values.push(data.projectId);
  }
  if (data.title !== undefined) {
    updates.push('title = ?');
    values.push(data.title);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    values.push(data.description);
  }
  if (data.status !== undefined) {
    updates.push('status = ?');
    values.push(data.status);
  }
  if (data.priority !== undefined) {
    updates.push('priority = ?');
    values.push(data.priority);
  }
  if (data.dueDate !== undefined) {
    updates.push('due_date = ?');
    values.push(data.dueDate);
  }

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());

  await db.run(
    `UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
    [...values, req.params.id, req.user!.id],
  );

  res.json({ task: toTask((await getTask(req.user!.id, req.params.id))!) });
});

tasksRouter.delete('/:id', async (req, res) => {
  const result = await db.run(
    'DELETE FROM tasks WHERE id = ? AND user_id = ?',
    [req.params.id, req.user!.id],
  );

  if (result.changes === 0) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }

  res.status(204).end();
});
