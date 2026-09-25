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
import { ServiceOwnershipResolver } from '../services/service-ownership.resolver.js';
import { SWAGGER_ACCESS_TOKEN_SECURITY } from '../swagger.js';
import { CreateSlotDto } from './dto/create-slot.dto.js';
import { PublicSlotQueryDto } from './dto/public-slot-query.dto.js';
import { UpdateSlotDto } from './dto/update-slot.dto.js';
import { VendorSlotQueryDto } from './dto/vendor-slot-query.dto.js';
import { SlotOwnershipResolver } from './slot-ownership.resolver.js';
import { SlotsService } from './slots.service.js';

const uuid = () => new ParseUUIDPipe({ version: '4' });
const ownedService = () =>
  RequireOwnership({
    type: 'RESOURCE',
    param: 'serviceId',
    resolver: ServiceOwnershipResolver,
  });
const ownedSlot = () =>
  RequireOwnership({
    type: 'RESOURCE',
    param: 'slotId',
    resolver: SlotOwnershipResolver,
  });

@ApiTags('Vendor Slots')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('vendor/services/:serviceId/slots')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.VENDOR)
export class VendorSlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Post()
  @UseGuards(OwnershipGuard)
  @ownedService()
  @ApiCreatedResponse({ description: 'OPEN Slot created' })
  create(
    @Param('serviceId', uuid()) serviceId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Body() dto: CreateSlotDto,
  ) {
    return this.slots.create(serviceId, user.id, dto);
  }

  @Get()
  @UseGuards(OwnershipGuard)
  @ownedService()
  @ApiOkResponse({ description: 'Vendor Slot list' })
  list(
    @Param('serviceId', uuid()) serviceId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: VendorSlotQueryDto,
  ) {
    return this.slots.listForVendor(serviceId, user.id, query);
  }

  @Get(':slotId')
  @UseGuards(OwnershipGuard)
  @ownedSlot()
  detail(
    @Param('serviceId', uuid()) serviceId: string,
    @Param('slotId', uuid()) slotId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.slots.findForVendor(serviceId, slotId, user.id);
  }

  @Patch(':slotId')
  @UseGuards(OwnershipGuard)
  @ownedSlot()
  update(
    @Param('serviceId', uuid()) serviceId: string,
    @Param('slotId', uuid()) slotId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Body() dto: UpdateSlotDto,
  ) {
    return this.slots.update(serviceId, slotId, user.id, dto);
  }

  @Post(':slotId/close')
  @UseGuards(OwnershipGuard)
  @ownedSlot()
  close(
    @Param('serviceId', uuid()) serviceId: string,
    @Param('slotId', uuid()) slotId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.slots.close(serviceId, slotId, user.id);
  }

  @Post(':slotId/open')
  @UseGuards(OwnershipGuard)
  @ownedSlot()
  open(
    @Param('serviceId', uuid()) serviceId: string,
    @Param('slotId', uuid()) slotId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.slots.open(serviceId, slotId, user.id);
  }

  @Post(':slotId/cancel')
  @UseGuards(OwnershipGuard)
  @ownedSlot()
  cancel(
    @Param('serviceId', uuid()) serviceId: string,
    @Param('slotId', uuid()) slotId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.slots.cancel(serviceId, slotId, user.id);
  }

  @Delete(':slotId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(OwnershipGuard)
  @ownedSlot()
  @ApiNoContentResponse({ description: 'Slot soft-deleted' })
  async remove(
    @Param('serviceId', uuid()) serviceId: string,
    @Param('slotId', uuid()) slotId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ): Promise<void> {
    await this.slots.softDelete(serviceId, slotId, user.id);
  }
}

@ApiTags('Public Slots')
@Controller('services/:serviceId/slots')
export class PublicSlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  @ApiOkResponse({ description: 'Future OPEN availability' })
  list(
    @Param('serviceId', uuid()) serviceId: string,
    @Query() query: PublicSlotQueryDto,
  ) {
    return this.slots.listPublic(serviceId, query);
  }
}
