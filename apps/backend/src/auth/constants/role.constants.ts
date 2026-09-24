export const RoleCode = {
  CUSTOMER: 'CUSTOMER',
  VENDOR: 'VENDOR',
  ADMIN: 'ADMIN',
} as const;

export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];
