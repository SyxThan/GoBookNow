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
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { SWAGGER_ACCESS_TOKEN_SECURITY } from '../swagger.js';
import {
  CategoriesService,
  type CategoryResponse,
} from './categories.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import {
  ListAdminCategoriesDto,
  ListPublicCategoriesDto,
} from './dto/list-category-query.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

const uuid = () => new ParseUUIDPipe({ version: '4' });

@ApiTags('Categories')
@Controller('categories')
export class PublicCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOkResponse({ description: 'Active categories' })
  list(@Query() query: ListPublicCategoriesDto): Promise<CategoryResponse[]> {
    return this.categoriesService.listPublic(query);
  }

  @Get(':slug')
  @ApiOkResponse({ description: 'Active category detail' })
  detail(@Param('slug') slug: string): Promise<CategoryResponse> {
    return this.categoriesService.findPublicBySlug(slug);
  }
}

@ApiTags('Admin Categories')
@ApiBearerAuth(SWAGGER_ACCESS_TOKEN_SECURITY)
@Controller('admin/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  list(@Query() query: ListAdminCategoriesDto): Promise<CategoryResponse[]> {
    return this.categoriesService.listAdmin(query);
  }

  @Post()
  @ApiCreatedResponse({ description: 'Category created' })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryResponse> {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.categoriesService.update(id, dto);
  }

  @Patch(':id/activate')
  activate(@Param('id', uuid()) id: string): Promise<CategoryResponse> {
    return this.categoriesService.activate(id);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', uuid()) id: string): Promise<CategoryResponse> {
    return this.categoriesService.deactivate(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Category soft-deleted' })
  async remove(@Param('id', uuid()) id: string): Promise<void> {
    await this.categoriesService.softDelete(id);
  }
}
