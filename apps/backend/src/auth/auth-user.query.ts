import { Prisma } from '../generated/prisma/client.js';

export const authRelations = {
  profile: true,
  userRoles: {
    include: {
      role: true,
    },
  },
} as const satisfies Prisma.UserInclude;

export type UserWithAuthRelations = Prisma.UserGetPayload<{
  include: typeof authRelations;
}>;
