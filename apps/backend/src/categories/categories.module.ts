import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  AdminCategoriesController,
  PublicCategoriesController,
} from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PublicCategoriesController, AdminCategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
