import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env['DATABASE_URL'];

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed roles');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const roles = [
  {
    code: 'CUSTOMER',
    name: 'Customer',
    description: 'End user who can search and book services',
    isSystem: true,
  },
  {
    code: 'VENDOR',
    name: 'Vendor',
    description: 'Approved service provider or event organizer',
    isSystem: true,
  },
  {
    code: 'ADMIN',
    name: 'Administrator',
    description: 'Platform administrator',
    isSystem: true,
  },
] as const;

async function main(): Promise<void> {
  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
      },
      create: role,
    });
  }

  console.log('Roles seeded successfully');
}

main()
  .catch((error: unknown) => {
    console.error('Failed to seed roles', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
