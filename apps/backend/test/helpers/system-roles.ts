import { RoleCode } from '../../src/auth/constants/role.constants.js';
import type { PrismaService } from '../../src/database/prisma/prisma.service.js';

const SYSTEM_ROLES = Object.values(RoleCode).map((code) => ({
  code,
  name: code,
  isSystem: true,
}));

/** Seeds shared roles safely when PostgreSQL-backed e2e files run in parallel. */
export async function ensureSystemRoles(
  prisma: Pick<PrismaService, 'role'>,
): Promise<void> {
  await prisma.role.createMany({
    data: SYSTEM_ROLES,
    skipDuplicates: true,
  });
}
