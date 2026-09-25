import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuditRequestMetadata } from '../audit/audit.service.js';
import { RoleCode } from '../auth/constants/role.constants.js';
import { CurrentUserDecorator } from '../auth/decorators/current-user.decorator.js';
import { RequireOwnership } from '../auth/decorators/ownership.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { OwnershipGuard } from '../auth/guards/ownership.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { CurrentUser } from '../auth/types/jwt-payload.type.js';
import { SWAGGER_ACCESS_TOKEN_SECURITY } from '../swagger.js';
import { VendorOwnershipResolver } from '../vendors/vendor-ownership.resolver.js';
import { ListVendorApplicationsDto } from './dto/list-applications.dto.js';
import {
  ApproveVendorApplicationDto,
  RejectVendorApplicationDto,
} from './dto/review-application.dto.js';
import { UploadDocumentDto } from './dto/upload-document.dto.js';
import {
  isAllowedDocumentMimeType,
  MAX_DOCUMENT_SIZE,
  type UploadedDocumentFile,
} from './document-file.js';
import { VendorApplicationOwnershipResolver } from './vendor-application-ownership.resolver.js';
import { VendorApplicationsService } from './vendor-applications.service.js';

const uuid = () => new ParseUUIDPipe({ version: '4' });

function auditRequestMetadata(request: Request): AuditRequestMetadata {
  return {
    ipAddress: request.ip?.slice(0, 64) ?? null,
    userAgent: request.get('user-agent')?.slice(0, 500) ?? null,
  };
}

@ApiTags('Vendor Applications')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('vendors/:vendorId/applications')
@UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
export class VendorApplicationSubmissionController {
  constructor(private readonly service: VendorApplicationsService) {}

  @Post()
  @Roles(RoleCode.CUSTOMER, RoleCode.VENDOR)
  @RequireOwnership({
    type: 'RESOURCE',
    param: 'vendorId',
    resolver: VendorOwnershipResolver,
  })
  @ApiCreatedResponse({ description: 'Vendor application submitted' })
  submit(
    @Param('vendorId', uuid()) vendorId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.submit(vendorId, user.id);
  }

  @Get('latest')
  @Roles(RoleCode.CUSTOMER, RoleCode.VENDOR, RoleCode.ADMIN)
  @RequireOwnership({
    type: 'RESOURCE',
    param: 'vendorId',
    resolver: VendorOwnershipResolver,
    adminBypass: true,
  })
  @ApiOkResponse({
    description: 'Latest application with documents and history',
  })
  latest(@Param('vendorId', uuid()) vendorId: string) {
    return this.service.findLatest(vendorId);
  }
}

@ApiTags('Vendor Applications')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('vendor-applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorApplicationsController {
  constructor(private readonly service: VendorApplicationsService) {}

  @Post(':id/documents')
  @UseGuards(OwnershipGuard)
  @Roles(RoleCode.CUSTOMER, RoleCode.VENDOR)
  @RequireOwnership({
    type: 'RESOURCE',
    param: 'id',
    resolver: VendorApplicationOwnershipResolver,
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DOCUMENT_SIZE },
      fileFilter: (_request, file, callback) => {
        if (!isAllowedDocumentMimeType(file.mimetype)) {
          callback(
            new BadRequestException(
              'Only PDF, JPEG, and PNG documents are allowed',
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ description: 'Protected document metadata' })
  upload(
    @Param('id', uuid()) applicationId: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file?: UploadedDocumentFile,
  ) {
    return this.service.uploadDocument(applicationId, dto.documentType, file);
  }

  @Get(':id/documents')
  @UseGuards(OwnershipGuard)
  @Roles(RoleCode.CUSTOMER, RoleCode.VENDOR, RoleCode.ADMIN)
  @RequireOwnership({
    type: 'RESOURCE',
    param: 'id',
    resolver: VendorApplicationOwnershipResolver,
    adminBypass: true,
  })
  listDocuments(@Param('id', uuid()) applicationId: string) {
    return this.service.listDocuments(applicationId);
  }

  @Get(':id/documents/:documentId/content')
  @UseGuards(OwnershipGuard)
  @Roles(RoleCode.CUSTOMER, RoleCode.VENDOR, RoleCode.ADMIN)
  @RequireOwnership({
    type: 'RESOURCE',
    param: 'id',
    resolver: VendorApplicationOwnershipResolver,
    adminBypass: true,
  })
  @Header('Cache-Control', 'private, no-store')
  async download(
    @Param('id', uuid()) applicationId: string,
    @Param('documentId', uuid()) documentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const document = await this.service.getDocumentContent(
      applicationId,
      documentId,
    );
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
    );
    return new StreamableFile(document.buffer);
  }

  @Get(':id/history')
  @UseGuards(OwnershipGuard)
  @Roles(RoleCode.CUSTOMER, RoleCode.VENDOR, RoleCode.ADMIN)
  @RequireOwnership({
    type: 'RESOURCE',
    param: 'id',
    resolver: VendorApplicationOwnershipResolver,
    adminBypass: true,
  })
  history(@Param('id', uuid()) applicationId: string) {
    return this.service.getHistory(applicationId);
  }
}

@ApiTags('Admin Vendor Applications')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('admin/vendor-applications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class AdminVendorApplicationsController {
  constructor(private readonly service: VendorApplicationsService) {}

  @Get()
  list(@Query() query: ListVendorApplicationsDto) {
    return this.service.listForAdmin(query);
  }

  @Get(':id')
  detail(@Param('id', uuid()) applicationId: string) {
    return this.service.findAdminDetail(applicationId);
  }

  @Post(':id/approve')
  approve(
    @Param('id', uuid()) applicationId: string,
    @CurrentUserDecorator() admin: CurrentUser,
    @Body() dto: ApproveVendorApplicationDto,
    @Req() request: Request,
  ) {
    return this.service.approve(
      applicationId,
      admin.id,
      dto,
      auditRequestMetadata(request),
    );
  }

  @Post(':id/reject')
  reject(
    @Param('id', uuid()) applicationId: string,
    @CurrentUserDecorator() admin: CurrentUser,
    @Body() dto: RejectVendorApplicationDto,
    @Req() request: Request,
  ) {
    return this.service.reject(
      applicationId,
      admin.id,
      dto.reason,
      auditRequestMetadata(request),
    );
  }
}
