import type { AuthenticatedUser } from './authenticated-user.type.js';

export type JwtPayload = {
  sub: string;
  roles: string[];
  type: 'access';
};

export type CurrentUser = AuthenticatedUser & {
  email: string;
  profile: {
    fullName: string;
    phone: string | null;
    avatarUrl: string | null;
    locale: string;
    timezone: string;
  } | null;
};
