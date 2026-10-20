import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BookingReviewsController, CustomerReviewsController, PublicVendorReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({ imports: [AuthModule], controllers: [BookingReviewsController,
  CustomerReviewsController, PublicVendorReviewsController], providers: [ReviewsService] })
export class ReviewsModule {}
