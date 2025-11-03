import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.resolve(__dirname, '../migrations');

const template = (name: string) => `import { type Kysely } from 'kysely';
import type { Database } from '../src/schema';

export async function up(db: Kysely<Database>): Promise<void> {
  // TODO: implement migration ${name}
}

export async function down(db: Kysely<Database>): Promise<void> {
  // TODO: revert migration ${name}
}
`;

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const timestamp = () => {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join('');
};

async function makeMigration() {
  const [, , name] = process.argv;
  if (!name) {
    console.error('Usage: pnpm db:migrate:make <name>');
    process.exit(1);
  }

  await fs.mkdir(migrationsDir, { recursive: true });
  const filename = `${timestamp()}_${slugify(name)}.ts`;
  const filePath = path.join(migrationsDir, filename);

  await fs.writeFile(filePath, template(name), { encoding: 'utf8', flag: 'wx' });
  console.log(`Created migration ${filename}`);
}

void makeMigration();
