export const AuditAction = {
  VENDOR_APPLICATION_APPROVED: 'VENDOR_APPLICATION_APPROVED',
  VENDOR_APPLICATION_REJECTED: 'VENDOR_APPLICATION_REJECTED',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const AuditEntityType = {
  VENDOR_APPLICATION: 'VendorApplication',
} as const;
