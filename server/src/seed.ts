import { db, newId, type Statement } from './db.js';
import { hashPassword } from './lib/password.js';

const DEMO_EMAIL = 'demo@taskflow.dev';
const DEMO_PASSWORD = 'taskflow123';

const existing = await db.get<{ id: string }>(
  'SELECT id FROM users WHERE email = ?',
  [DEMO_EMAIL],
);

if (existing) {
  await db.run('UPDATE users SET email_verified = 1 WHERE id = ?', [existing.id]);
  console.log('Demo account already exists — nothing to do.');
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  await db.close();
  process.exit(0);
}

const passwordHash = await hashPassword(DEMO_PASSWORD);
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

function localDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const userId = newId();

const projects = [
  { id: newId(), name: 'Personal', color: '#6366f1' },
  { id: newId(), name: 'Work', color: '#0ea5e9' },
  { id: newId(), name: 'Health', color: '#22c55e' },
];

const tasks = [
  {
    project: 0,
    title: 'Plan the week',
    description: 'Pick three outcomes that would make this week a win, then block time for them.',
    status: 'todo',
    priority: 'high',
    dueDate: localDate(0),
  },
  {
    project: 0,
    title: 'Buy groceries',
    description: 'Oats, coffee, olive oil, veggies, and something for Friday dinner.',
    status: 'in_progress',
    priority: 'medium',
    dueDate: localDate(1),
  },
  {
    project: 0,
    title: 'Read 20 pages',
    description: 'Continue the book on the nightstand.',
    status: 'todo',
    priority: 'low',
    dueDate: localDate(3),
  },
  {
    project: 0,
    title: 'Morning run',
    description: 'Easy 5k around the park before breakfast.',
    status: 'done',
    priority: 'medium',
    dueDate: localDate(-1),
  },
  {
    project: 1,
    title: 'Ship onboarding flow',
    description: 'Polish the empty states, add the checklist, and release behind the flag.',
    status: 'in_progress',
    priority: 'high',
    dueDate: localDate(2),
  },
  {
    project: 1,
    title: 'Review pull requests',
    description: 'Clear the review queue before the afternoon standup.',
    status: 'todo',
    priority: 'medium',
    dueDate: localDate(1),
  },
  {
    project: 1,
    title: 'Prepare sprint demo',
    description: 'Record a three-minute walkthrough of the new dashboard.',
    status: 'todo',
    priority: 'high',
    dueDate: localDate(4),
  },
  {
    project: 1,
    title: 'Update roadmap',
    description: 'Re-sequence Q3 around the billing work.',
    status: 'done',
    priority: 'high',
    dueDate: localDate(-2),
  },
  {
    project: 2,
    title: 'Book dentist appointment',
    description: 'The six-month checkup is overdue.',
    status: 'todo',
    priority: 'medium',
    dueDate: localDate(-1),
  },
  {
    project: 2,
    title: 'Meal prep for the week',
    description: 'Roast vegetables, cook grains, and portion out lunches.',
    status: 'in_progress',
    priority: 'low',
    dueDate: localDate(1),
  },
] as const;

const statements: Statement[] = [
  {
    sql: 'INSERT INTO users (id, name, email, password_hash, email_verified, created_at) VALUES (?, ?, ?, ?, 1, ?)',
    params: [userId, 'Demo User', DEMO_EMAIL, passwordHash, iso(now)],
  },
];

projects.forEach((project, index) => {
  statements.push({
    sql: 'INSERT INTO projects (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)',
    params: [project.id, userId, project.name, project.color, iso(now + index * 1000)],
  });
});

tasks.forEach((task, index) => {
  const createdAt = iso(now - index * 60_000);
  statements.push({
    sql: `INSERT INTO tasks
       (id, user_id, project_id, title, description, status, priority, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      newId(),
      userId,
      projects[task.project]!.id,
      task.title,
      task.description,
      task.status,
      task.priority,
      task.dueDate,
      createdAt,
      createdAt,
    ],
  });
});

await db.transaction(statements);
await db.close();

console.log('Seeded the demo account.');
console.log(`  Email:    ${DEMO_EMAIL}`);
console.log(`  Password: ${DEMO_PASSWORD}`);
console.log(`  Projects: ${projects.length}, tasks: ${tasks.length}`);
