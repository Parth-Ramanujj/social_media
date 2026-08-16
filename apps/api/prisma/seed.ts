import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

loadEnv({ path: resolve(__dirname, '../../../.env') });

/**
 * Dev seed: creates a demo user (pulse@example.com / pulse1234) with a
 * "Pulse HQ" workspace and an editor teammate.
 * Run with: pnpm db:seed
 */
const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('pulse1234', 10);

  const owner = await prisma.user.upsert({
    where: { email: 'pulse@example.com' },
    update: {},
    create: { email: 'pulse@example.com', passwordHash, name: 'Pulse Admin' },
  });

  const teammate = await prisma.user.upsert({
    where: { email: 'editor@example.com' },
    update: {},
    create: { email: 'editor@example.com', passwordHash, name: 'Editor Teammate' },
  });

  const workspace = await prisma.workspace.upsert({
    where: { id: 'seed-workspace' },
    update: {},
    create: {
      id: 'seed-workspace',
      name: 'Pulse HQ',
      members: {
        create: [
          { userId: owner.id, role: 'owner' },
          { userId: teammate.id, role: 'editor' },
        ],
      },
    },
  });

  // Ensure unique membership rows even if the workspace existed without them.
  for (const [userId, role] of [
    [owner.id, 'owner'],
    [teammate.id, 'editor'],
  ] as const) {
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
      update: {},
      create: { workspaceId: workspace.id, userId, role },
    });
  }

  console.log('Seeded:');
  console.log('  user      pulse@example.com / pulse1234 (owner)');
  console.log('  user      editor@example.com / pulse1234 (editor)');
  console.log(`  workspace ${workspace.name} (${workspace.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());