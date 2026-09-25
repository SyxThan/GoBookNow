import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { CategoryScope, PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env['DATABASE_URL'];

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database');
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

const categories = [
  {
    code: 'SPA_BEAUTY',
    name: 'Spa & Beauty',
    slug: 'spa-beauty',
    scope: CategoryScope.SERVICE,
    description: 'Spa, beauty, and wellness services',
    sortOrder: 10,
  },
  {
    code: 'HEALTHCARE',
    name: 'Healthcare',
    slug: 'healthcare',
    scope: CategoryScope.SERVICE,
    description: 'Healthcare and medical services',
    sortOrder: 20,
  },
  {
    code: 'FITNESS',
    name: 'Fitness',
    slug: 'fitness',
    scope: CategoryScope.SERVICE,
    description: 'Fitness training and exercise services',
    sortOrder: 30,
  },
  {
    code: 'SPORTS',
    name: 'Sports',
    slug: 'sports',
    scope: CategoryScope.SERVICE,
    description: 'Sports coaching and activity services',
    sortOrder: 40,
  },
  {
    code: 'EDUCATION',
    name: 'Education & Classes',
    slug: 'education-classes',
    scope: CategoryScope.SERVICE,
    description: 'Education, tutoring, and recurring classes',
    sortOrder: 50,
  },
  {
    code: 'PERSONAL_CARE',
    name: 'Personal Care',
    slug: 'personal-care',
    scope: CategoryScope.SERVICE,
    description: 'Personal care and grooming services',
    sortOrder: 60,
  },
  {
    code: 'CONSULTING',
    name: 'Consulting',
    slug: 'consulting',
    scope: CategoryScope.SERVICE,
    description: 'Professional consulting services',
    sortOrder: 70,
  },
  {
    code: 'OTHER_SERVICE',
    name: 'Other Services',
    slug: 'other-services',
    scope: CategoryScope.SERVICE,
    description: 'Other service categories',
    sortOrder: 80,
  },
  {
    code: 'WORKSHOP',
    name: 'Workshop',
    slug: 'workshop',
    scope: CategoryScope.EVENT,
    description: 'Hands-on workshops and practical sessions',
    sortOrder: 10,
  },
  {
    code: 'CONFERENCE',
    name: 'Conference',
    slug: 'conference',
    scope: CategoryScope.EVENT,
    description: 'Conferences, summits, and professional gatherings',
    sortOrder: 20,
  },
  {
    code: 'ENTERTAINMENT',
    name: 'Entertainment',
    slug: 'entertainment',
    scope: CategoryScope.EVENT,
    description: 'Entertainment and live experience events',
    sortOrder: 30,
  },
  {
    code: 'COMMUNITY',
    name: 'Community',
    slug: 'community',
    scope: CategoryScope.EVENT,
    description: 'Community meetings and social events',
    sortOrder: 40,
  },
  {
    code: 'EDUCATION_EVENT',
    name: 'Education Event',
    slug: 'education-event',
    scope: CategoryScope.EVENT,
    description: 'Education-focused events and seminars',
    sortOrder: 50,
  },
  {
    code: 'SPORT_EVENT',
    name: 'Sport Event',
    slug: 'sport-event',
    scope: CategoryScope.EVENT,
    description: 'Sport competitions and participation events',
    sortOrder: 60,
  },
  {
    code: 'OTHER_EVENT',
    name: 'Other Events',
    slug: 'other-events',
    scope: CategoryScope.EVENT,
    description: 'Other event categories',
    sortOrder: 70,
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

  for (const category of categories) {
    await prisma.category.upsert({
      where: { code: category.code },
      update: {
        name: category.name,
        description: category.description,
        scope: category.scope,
        sortOrder: category.sortOrder,
        isActive: true,
        deletedAt: null,
      },
      create: {
        ...category,
        isActive: true,
      },
    });
  }

  console.log(
    `Seeded ${roles.length} roles and ${categories.length} categories successfully`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Failed to seed database', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
