import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  VendorApplicationStatus,
  VendorStatus,
  type VendorDocumentType,
} from '../generated/prisma/client.js';
import { AuditAction, AuditEntityType } from '../audit/audit.constants.js';
import {
  AuditService,
  type AuditRequestMetadata,
} from '../audit/audit.service.js';
import { RoleCode } from '../auth/constants/role.constants.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import type { ListVendorApplicationsDto } from './dto/list-applications.dto.js';
import type { ApproveVendorApplicationDto } from './dto/review-application.dto.js';
import {
  MAX_DOCUMENTS_PER_APPLICATION,
  type UploadedDocumentFile,
  validateUploadedDocument,
} from './document-file.js';
import { FileStorageService } from './file-storage.service.js';

const documentSelect = {
  id: true,
  applicationId: true,
  documentType: true,
  originalName: true,
  fileUrl: true,
  mimeType: true,
  fileSize: true,
  uploadedAt: true,
} as const satisfies Prisma.VendorApplicationDocumentSelect;

const historySelect = {
  id: true,
  fromStatus: true,
  toStatus: true,
  note: true,
  createdAt: true,
} as const satisfies Prisma.VendorApplicationHistorySelect;

const applicationSelect = {
  id: true,
  vendorId: true,
  status: true,
  submittedAt: true,
  reviewedAt: true,
  reviewNote: true,
  createdAt: true,
  updatedAt: true,
  documents: { select: documentSelect, orderBy: { uploadedAt: 'asc' } },
  history: { select: historySelect, orderBy: { createdAt: 'asc' } },
} as const satisfies Prisma.VendorApplicationSelect;

const adminVendorSelect = {
  id: true,
  displayName: true,
  slug: true,
  description: true,
  logoUrl: true,
  legalName: true,
  vendorType: true,
  taxCode: true,
  businessRegistrationNumber: true,
  legalRepresentativeName: true,
  contactEmail: true,
  contactPhone: true,
  addressLine: true,
  ward: true,
  district: true,
  province: true,
  countryCode: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.VendorSelect;

export type VendorApplicationResponse = Prisma.VendorApplicationGetPayload<{
  select: typeof applicationSelect;
}>;
export type VendorDocumentResponse =
  Prisma.VendorApplicationDocumentGetPayload<{
    select: typeof documentSelect;
  }>;
export type VendorApplicationHistoryResponse =
  Prisma.VendorApplicationHistoryGetPayload<{ select: typeof historySelect }>;

@Injectable()
export class VendorApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly auditService: AuditService,
  ) {}

  async submit(
    vendorId: string,
    ownerUserId: string,
  ): Promise<VendorApplicationResponse> {
    let applicationId: string;
    try {
      applicationId = await this.prisma.$transaction(async (transaction) => {
        const vendor = await transaction.vendor.findFirst({
          where: { id: vendorId, ownerUserId, deletedAt: null },
          select: { status: true },
        });
        if (!vendor) throw new NotFoundException('Vendor not found');
        if (
          vendor.status !== VendorStatus.DRAFT &&
          vendor.status !== VendorStatus.REJECTED
        ) {
          throw new ConflictException(
            `Vendor in ${vendor.status} status cannot be submitted`,
          );
        }

        const updated = await transaction.vendor.updateMany({
          where: {
            id: vendorId,
            ownerUserId,
            deletedAt: null,
            status: vendor.status,
          },
          data: { status: VendorStatus.PENDING },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'Vendor application submission conflicted',
          );
        }

        const application = await transaction.vendorApplication.create({
          data: {
            vendorId,
            status: VendorApplicationStatus.PENDING,
          },
          select: { id: true },
        });
        await transaction.vendorApplicationHistory.create({
          data: {
            applicationId: application.id,
            fromStatus: null,
            toStatus: VendorApplicationStatus.PENDING,
            changedByUserId: ownerUserId,
            note: 'Vendor application submitted',
          },
        });
        return application.id;
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Vendor already has a pending application');
      }
      throw error;
    }
    return this.findById(applicationId);
  }

  async findLatest(vendorId: string): Promise<VendorApplicationResponse> {
    const application = await this.prisma.vendorApplication.findFirst({
      where: { vendorId, vendor: { deletedAt: null } },
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
      select: applicationSelect,
    });
    if (!application)
      throw new NotFoundException('Vendor application not found');
    return application;
  }

  async findById(applicationId: string): Promise<VendorApplicationResponse> {
    const application = await this.prisma.vendorApplication.findFirst({
      where: { id: applicationId, vendor: { deletedAt: null } },
      select: applicationSelect,
    });
    if (!application)
      throw new NotFoundException('Vendor application not found');
    return application;
  }

  async uploadDocument(
    applicationId: string,
    documentType: VendorDocumentType,
    file?: UploadedDocumentFile,
  ): Promise<VendorDocumentResponse> {
    validateUploadedDocument(file);
    const application = await this.prisma.vendorApplication.findUnique({
      where: { id: applicationId },
      select: { status: true, _count: { select: { documents: true } } },
    });
    if (!application)
      throw new NotFoundException('Vendor application not found');
    if (application.status !== VendorApplicationStatus.PENDING) {
      throw new ConflictException(
        'Documents can only be uploaded while application is pending',
      );
    }
    if (application._count.documents >= MAX_DOCUMENTS_PER_APPLICATION) {
      throw new ConflictException(
        'An application can contain at most 5 documents',
      );
    }

    const stored = await this.storage.save(file);
    const documentId = randomUUID();
    try {
      return await this.prisma.vendorApplicationDocument.create({
        data: {
          id: documentId,
          applicationId,
          documentType,
          originalName: stored.originalName,
          storedName: stored.storedName,
          fileUrl: `/api/v1/vendor-applications/${applicationId}/documents/${documentId}/content`,
          mimeType: file.mimetype,
          fileSize: file.size,
        },
        select: documentSelect,
      });
    } catch (error: unknown) {
      await this.storage.delete(stored.storedName);
      throw error;
    }
  }

  async listDocuments(
    applicationId: string,
  ): Promise<VendorDocumentResponse[]> {
    await this.assertExists(applicationId);
    return this.prisma.vendorApplicationDocument.findMany({
      where: { applicationId },
      orderBy: { uploadedAt: 'asc' },
      select: documentSelect,
    });
  }

  async getDocumentContent(
    applicationId: string,
    documentId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
    const document = await this.prisma.vendorApplicationDocument.findFirst({
      where: { id: documentId, applicationId },
      select: { storedName: true, mimeType: true, originalName: true },
    });
    if (!document) throw new NotFoundException('Document not found');
    return {
      buffer: await this.storage.read(document.storedName),
      mimeType: document.mimeType,
      originalName: document.originalName,
    };
  }

  async getHistory(
    applicationId: string,
  ): Promise<VendorApplicationHistoryResponse[]> {
    await this.assertExists(applicationId);
    return this.prisma.vendorApplicationHistory.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'asc' },
      select: historySelect,
    });
  }

  async listForAdmin(query: ListVendorApplicationsDto) {
    const status = query.status ?? VendorApplicationStatus.PENDING;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.VendorApplicationWhereInput = {
      status,
      vendor: { deletedAt: null },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.vendorApplication.findMany({
        where,
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          status: true,
          submittedAt: true,
          reviewedAt: true,
          vendor: {
            select: {
              id: true,
              displayName: true,
              legalName: true,
              vendorType: true,
              taxCode: true,
              owner: {
                select: {
                  id: true,
                  email: true,
                  profile: { select: { fullName: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.vendorApplication.count({ where }),
    ]);
    return {
      items: rows.map(({ id, ...item }) => ({ applicationId: id, ...item })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findAdminDetail(applicationId: string) {
    const application = await this.prisma.vendorApplication.findUnique({
      where: { id: applicationId },
      select: {
        ...applicationSelect,
        reviewedByUserId: true,
        reviewer: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
        vendor: {
          select: {
            ...adminVendorSelect,
            owner: {
              select: {
                id: true,
                email: true,
                profile: { select: { fullName: true } },
              },
            },
          },
        },
      },
    });
    if (!application)
      throw new NotFoundException('Vendor application not found');
    return application;
  }

  async approve(
    applicationId: string,
    adminUserId: string,
    dto: ApproveVendorApplicationDto,
    requestMetadata: AuditRequestMetadata,
  ) {
    await this.review(
      applicationId,
      adminUserId,
      VendorApplicationStatus.APPROVED,
      dto.note,
      requestMetadata,
    );
    return this.findAdminDetail(applicationId);
  }

  async reject(
    applicationId: string,
    adminUserId: string,
    reason: string,
    requestMetadata: AuditRequestMetadata,
  ) {
    await this.review(
      applicationId,
      adminUserId,
      VendorApplicationStatus.REJECTED,
      reason,
      requestMetadata,
    );
    return this.findAdminDetail(applicationId);
  }

  private async review(
    applicationId: string,
    adminUserId: string,
    toStatus: 'APPROVED' | 'REJECTED',
    note?: string,
    requestMetadata: AuditRequestMetadata = {},
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const application = await transaction.vendorApplication.findUnique({
        where: { id: applicationId },
        select: {
          status: true,
          vendorId: true,
          vendor: { select: { ownerUserId: true } },
        },
      });
      if (!application)
        throw new NotFoundException('Vendor application not found');
      if (application.status !== VendorApplicationStatus.PENDING) {
        throw new ConflictException(
          `Application in ${application.status} status cannot be reviewed`,
        );
      }

      const reviewedAt = new Date();
      const transitioned = await transaction.vendorApplication.updateMany({
        where: { id: applicationId, status: VendorApplicationStatus.PENDING },
        data: {
          status: toStatus,
          reviewedAt,
          reviewedByUserId: adminUserId,
          reviewNote: note ?? null,
        },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException('Application was already reviewed');
      }

      const vendorStatus =
        toStatus === VendorApplicationStatus.APPROVED
          ? VendorStatus.APPROVED
          : VendorStatus.REJECTED;
      const vendorUpdated = await transaction.vendor.updateMany({
        where: {
          id: application.vendorId,
          deletedAt: null,
          status: VendorStatus.PENDING,
        },
        data: { status: vendorStatus },
      });
      if (vendorUpdated.count !== 1) {
        throw new ConflictException('Vendor is not pending review');
      }

      if (toStatus === VendorApplicationStatus.APPROVED) {
        const vendorRole = await transaction.role.findUnique({
          where: { code: RoleCode.VENDOR },
          select: { id: true },
        });
        if (!vendorRole) {
          throw new InternalServerErrorException(
            'VENDOR system role is missing',
          );
        }
        await transaction.userRole.upsert({
          where: {
            userId_roleId: {
              userId: application.vendor.ownerUserId,
              roleId: vendorRole.id,
            },
          },
          update: {},
          create: {
            userId: application.vendor.ownerUserId,
            roleId: vendorRole.id,
          },
        });
      }

      await transaction.vendorApplicationHistory.create({
        data: {
          applicationId,
          fromStatus: VendorApplicationStatus.PENDING,
          toStatus,
          changedByUserId: adminUserId,
          note: note ?? null,
        },
      });

      const approved = toStatus === VendorApplicationStatus.APPROVED;
      await this.auditService.create(
        {
          actorUserId: adminUserId,
          action: approved
            ? AuditAction.VENDOR_APPLICATION_APPROVED
            : AuditAction.VENDOR_APPLICATION_REJECTED,
          entityType: AuditEntityType.VENDOR_APPLICATION,
          entityId: applicationId,
          targetUserId: application.vendor.ownerUserId,
          metadata: approved
            ? {
                vendorId: application.vendorId,
                applicationId,
                fromStatus: VendorApplicationStatus.PENDING,
                toStatus,
                reviewNote: note ?? null,
              }
            : {
                vendorId: application.vendorId,
                applicationId,
                fromStatus: VendorApplicationStatus.PENDING,
                toStatus,
                reason: note ?? null,
              },
          ...requestMetadata,
        },
        transaction,
      );
    });
  }

  private async assertExists(applicationId: string): Promise<void> {
    const application = await this.prisma.vendorApplication.findUnique({
      where: { id: applicationId },
      select: { id: true },
    });
    if (!application)
      throw new NotFoundException('Vendor application not found');
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
