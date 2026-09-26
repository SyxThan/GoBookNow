import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BookingCodeService {
  generate(now: Date): string {
    const year = now.getUTCFullYear().toString().padStart(4, '0');
    const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = now.getUTCDate().toString().padStart(2, '0');
    const suffix = randomBytes(4).toString('hex').toUpperCase();
    return `GBK-${year}${month}${day}-${suffix}`;
  }
}
