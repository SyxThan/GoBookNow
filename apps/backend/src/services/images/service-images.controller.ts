import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RoleCode } from '../../auth/constants/role.constants.js';
import { CurrentUserDecorator } from '../../auth/decorators/current-user.decorator.js';
import { RequireOwnership } from '../../auth/decorators/ownership.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { OwnershipGuard } from '../../auth/guards/ownership.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { CurrentUser } from '../../auth/types/jwt-payload.type.js';
import { SWAGGER_ACCESS_TOKEN_SECURITY } from '../../swagger.js';
import { ServiceOwnershipResolver } from '../service-ownership.resolver.js';
import {
  isAllowedServiceImageMimeType,
  MAX_SERVICE_IMAGE_SIZE,
  type UploadedServiceImage,
} from './service-image-file.js';
import { ServiceImagesService } from './service-images.service.js';

const uuid = () => new ParseUUIDPipe({ version: '4' });

@ApiTags('Vendor Service Images')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('vendor/services/:serviceId/images')
@UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
@Roles(RoleCode.VENDOR)
@RequireOwnership({
  type: 'RESOURCE',
  param: 'serviceId',
  resolver: ServiceOwnershipResolver,
})
export class ServiceImagesController {
  constructor(private readonly serviceImages: ServiceImagesService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_SERVICE_IMAGE_SIZE },
      fileFilter: (_request, file, callback) => {
        if (!isAllowedServiceImageMimeType(file.mimetype)) {
          callback(
            new BadRequestException(
              'Only JPEG, PNG, and WebP images are allowed',
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
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ description: 'Service image metadata' })
  upload(
    @Param('serviceId', uuid()) serviceId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @UploadedFile() image?: UploadedServiceImage,
  ) {
    return this.serviceImages.upload(serviceId, user.id, image);
  }

  @Get()
  @ApiOkResponse({ description: 'Ordered Service image metadata' })
  list(
    @Param('serviceId', uuid()) serviceId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.serviceImages.list(serviceId, user.id);
  }

  @Patch(':imageId/primary')
  @ApiOkResponse({ description: 'Selected image is now primary' })
  setPrimary(
    @Param('serviceId', uuid()) serviceId: string,
    @Param('imageId', uuid()) imageId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.serviceImages.setPrimary(serviceId, imageId, user.id);
  }

  @Delete(':imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Remote image and metadata deleted' })
  async remove(
    @Param('serviceId', uuid()) serviceId: string,
    @Param('imageId', uuid()) imageId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ): Promise<void> {
    await this.serviceImages.delete(serviceId, imageId, user.id);
  }
}
