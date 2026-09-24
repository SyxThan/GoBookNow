export type JwtPayload = {
  sub: string;
  roles: string[];
  type: 'access';
};

export type CurrentUser = {
  id: string;
  email: string;
  profile: {
    fullName: string;
    phone: string | null;
    avatarUrl: string | null;
    locale: string;
    timezone: string;
  } | null;
  roles: string[];
};
