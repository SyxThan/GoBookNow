import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserDecorator } from '../auth/decorators/current-user.decorator.js';
import { RequireOwnership } from '../auth/decorators/ownership.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RoleCode } from '../auth/constants/role.constants.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { OwnershipGuard } from '../auth/guards/ownership.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { CurrentUser } from '../auth/types/jwt-payload.type.js';
import { SWAGGER_ACCESS_TOKEN_SECURITY } from '../swagger.js';
import { CreateVendorDto } from './dto/create-vendor.dto.js';
import { UpdateVendorDto } from './dto/update-vendor.dto.js';
import { VendorResponseDto } from './dto/vendor-response.dto.js';
import { VendorOwnershipResolver } from './vendor-ownership.resolver.js';
import { VendorsService, type VendorResponse } from './vendors.service.js';

@ApiTags('Vendors')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@ApiUnauthorizedResponse({ description: 'Access token is missing or invalid' })
@Controller('vendors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  @Roles(RoleCode.CUSTOMER, RoleCode.VENDOR)
  @ApiCreatedResponse({ type: VendorResponseDto })
  @ApiForbiddenResponse({ description: 'Role is not allowed to create Vendor' })
  @ApiConflictResponse({
    description: 'Vendor or legal identifier already exists',
  })
  create(
    @CurrentUserDecorator() user: CurrentUser,
    @Body() dto: CreateVendorDto,
  ): Promise<VendorResponse> {
    return this.vendorsService.create(user.id, dto);
  }

  @Get('me')
  @Roles(RoleCode.CUSTOMER, RoleCode.VENDOR)
  @ApiOkResponse({ type: VendorResponseDto })
  @ApiNotFoundResponse({ description: 'Vendor not found' })
  findMine(@CurrentUserDecorator() user: CurrentUser): Promise<VendorResponse> {
    return this.vendorsService.findMine(user.id);
  }

  @Get(':id')
  @UseGuards(OwnershipGuard)
  @Roles(RoleCode.CUSTOMER, RoleCode.VENDOR, RoleCode.ADMIN)
  @RequireOwnership({
    type: 'RESOURCE',
    param: 'id',
    resolver: VendorOwnershipResolver,
    adminBypass: true,
  })
  @ApiOkResponse({ type: VendorResponseDto })
  @ApiForbiddenResponse({ description: 'Vendor ownership is required' })
  @ApiNotFoundResponse({ description: 'Vendor not found' })
  findById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<VendorResponse> {
    return this.vendorsService.findById(id);
  }

  @Patch(':id')
  @UseGuards(OwnershipGuard)
  @Roles(RoleCode.CUSTOMER, RoleCode.VENDOR)
  @RequireOwnership({
    type: 'RESOURCE',
    param: 'id',
    resolver: VendorOwnershipResolver,
  })
  @ApiOkResponse({ type: VendorResponseDto })
  @ApiForbiddenResponse({ description: 'Vendor ownership is required' })
  @ApiNotFoundResponse({ description: 'Vendor not found' })
  @ApiConflictResponse({ description: 'Legal identifier already exists' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateVendorDto,
  ): Promise<VendorResponse> {
    return this.vendorsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(OwnershipGuard)
  @Roles(RoleCode.CUSTOMER, RoleCode.VENDOR)
  @RequireOwnership({
    type: 'RESOURCE',
    param: 'id',
    resolver: VendorOwnershipResolver,
  })
  @ApiNoContentResponse({ description: 'Vendor soft-deleted' })
  @ApiForbiddenResponse({ description: 'Vendor ownership is required' })
  @ApiNotFoundResponse({ description: 'Vendor not found' })
  @ApiConflictResponse({ description: 'Vendor status does not allow deletion' })
  async remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.vendorsService.softDelete(id);
  }
}
