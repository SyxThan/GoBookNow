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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RoleCode } from '../auth/constants/role.constants.js';
import { CurrentUserDecorator } from '../auth/decorators/current-user.decorator.js';
import { RequireOwnership } from '../auth/decorators/ownership.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { OwnershipGuard } from '../auth/guards/ownership.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { CurrentUser } from '../auth/types/jwt-payload.type.js';
import { SWAGGER_ACCESS_TOKEN_SECURITY } from '../swagger.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { PublicServiceQueryDto } from './dto/public-service-query.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { VendorServiceQueryDto } from './dto/vendor-service-query.dto.js';
import { ServiceOwnershipResolver } from './service-ownership.resolver.js';
import { ServicesService } from './services.service.js';

const uuid = () => new ParseUUIDPipe({ version: '4' });
const ownedService = () =>
  RequireOwnership({
    type: 'RESOURCE',
    param: 'id',
    resolver: ServiceOwnershipResolver,
  });

@ApiTags('Services')
@Controller('services')
export class PublicServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @ApiOkResponse({ description: 'Published public catalog' })
  list(@Query() query: PublicServiceQueryDto) {
    return this.servicesService.listPublic(query);
  }

  @Get(':slug')
  @ApiOkResponse({ description: 'Published Service detail' })
  detail(@Param('slug') slug: string) {
    return this.servicesService.findPublicBySlug(slug);
  }
}

@ApiTags('Vendor Services')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('vendor/services')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.VENDOR)
export class VendorServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @ApiCreatedResponse({ description: 'DRAFT Service created' })
  create(
    @CurrentUserDecorator() user: CurrentUser,
    @Body() dto: CreateServiceDto,
  ) {
    return this.servicesService.create(user.id, dto);
  }

  @Get()
  list(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: VendorServiceQueryDto,
  ) {
    return this.servicesService.listForVendor(user.id, query);
  }

  @Get(':id')
  @UseGuards(OwnershipGuard)
  @ownedService()
  detail(@Param('id', uuid()) id: string) {
    return this.servicesService.findForVendor(id);
  }

  @Patch(':id')
  @UseGuards(OwnershipGuard)
  @ownedService()
  update(@Param('id', uuid()) id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(id, dto);
  }

  @Post(':id/publish')
  @UseGuards(OwnershipGuard)
  @ownedService()
  publish(@Param('id', uuid()) id: string) {
    return this.servicesService.publish(id);
  }

  @Post(':id/hide')
  @UseGuards(OwnershipGuard)
  @ownedService()
  hide(@Param('id', uuid()) id: string) {
    return this.servicesService.hide(id);
  }

  @Post(':id/archive')
  @UseGuards(OwnershipGuard)
  @ownedService()
  archive(@Param('id', uuid()) id: string) {
    return this.servicesService.archive(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Service soft-deleted' })
  @UseGuards(OwnershipGuard)
  @ownedService()
  async remove(@Param('id', uuid()) id: string): Promise<void> {
    await this.servicesService.softDelete(id);
  }
}
