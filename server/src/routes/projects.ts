import { Router } from 'express';
import { z } from 'zod';
import { db, newId } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { toProject, type ProjectRow } from '../models.js';

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

const projectSelect = `
  SELECT p.*,
         COUNT(t.id) AS task_count,
         COALESCE(SUM(CASE WHEN t.status != 'done' THEN 1 ELSE 0 END), 0) AS open_task_count
  FROM projects p
  LEFT JOIN tasks t ON t.project_id = p.id AND t.user_id = p.user_id
  WHERE p.user_id = ?
  GROUP BY p.id
  ORDER BY p.created_at ASC
`;

const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the project a name.')
    .max(60, 'Project name is too long.'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Pick a valid color.')
    .optional()
    .default('#6366f1'),
});

const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty.').max(60).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Pick a valid color.')
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Nothing to update.',
  });

projectsRouter.get('/', (req, res) => {
  const rows = db.prepare(projectSelect).all(req.user!.id) as ProjectRow[];
  res.json({ projects: rows.map(toProject) });
});

projectsRouter.post('/', (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const { name, color } = parsed.data;
  const row: ProjectRow = {
    id: newId(),
    user_id: req.user!.id,
    name,
    color,
    created_at: new Date().toISOString(),
    task_count: 0,
    open_task_count: 0,
  };

  db.prepare(
    'INSERT INTO projects (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(row.id, row.user_id, row.name, row.color, row.created_at);

  res.status(201).json({ project: toProject(row) });
});

projectsRouter.patch('/:id', (req, res) => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const existing = db
    .prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id) as { id: string } | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  const updates: string[] = [];
  const values: string[] = [];

  if (parsed.data.name !== undefined) {
    updates.push('name = ?');
    values.push(parsed.data.name);
  }
  if (parsed.data.color !== undefined) {
    updates.push('color = ?');
    values.push(parsed.data.color);
  }

  db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(
    ...values,
    req.params.id,
    req.user!.id,
  );

  const row = db
    .prepare(
      `SELECT p.*, COUNT(t.id) AS task_count,
              COALESCE(SUM(CASE WHEN t.status != 'done' THEN 1 ELSE 0 END), 0) AS open_task_count
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id AND t.user_id = p.user_id
       WHERE p.id = ? AND p.user_id = ?
       GROUP BY p.id`,
    )
    .get(req.params.id, req.user!.id) as ProjectRow;

  res.json({ project: toProject(row) });
});

projectsRouter.delete('/:id', (req, res) => {
  const count = db
    .prepare('SELECT COUNT(*) AS count FROM projects WHERE user_id = ?')
    .get(req.user!.id) as { count: number };

  if (count.count <= 1) {
    res.status(400).json({ error: 'You need at least one project.' });
    return;
  }

  const result = db
    .prepare('DELETE FROM projects WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user!.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  res.status(204).end();
});
