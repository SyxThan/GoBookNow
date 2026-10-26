export type Status = "PENDING" | "APPROVED" | "REJECTED";
export type Person = {
  id: string;
  email: string;
  profile: { fullName: string } | null;
};
export type Item = {
  applicationId: string;
  status: Status;
  submittedAt: string;
  reviewedAt: string | null;
  vendor: {
    id: string;
    displayName: string;
    legalName: string | null;
    vendorType: string | null;
    taxCode: string | null;
    owner: Person;
  };
};
export type Page<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
export type Document = {
  id: string;
  originalName: string;
  documentType: string;
  fileUrl: string;
  fileSize: number;
};
export type History = {
  id: string;
  fromStatus: Status | null;
  toStatus: Status;
  note: string | null;
  createdAt: string;
};
export type Detail = Omit<Item, "applicationId" | "vendor"> & {
  id: string;
  reviewNote: string | null;
  reviewedByUserId: string | null;
  reviewer: Person | null;
  documents: Document[];
  history: History[];
  vendor: Omit<Item["vendor"], "owner"> & {
    slug: string;
    status: string;
    description: string | null;
    legalName: string | null;
    vendorType: string | null;
    taxCode: string | null;
    businessRegistrationNumber: string | null;
    legalRepresentativeName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    addressLine: string | null;
    ward: string | null;
    district: string | null;
    province: string | null;
    countryCode: string;
    owner: Person;
  };
};
export type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  targetUserId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: Person | null;
};
