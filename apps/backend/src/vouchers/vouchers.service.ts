import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  VoucherClaimStatus,
  VoucherType,
} from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma/prisma.service.js';
import { calculateVoucherDiscount } from './voucher-discount.engine.js';
import type { CreateVoucherDto, UpdateVoucherDto } from './dto/voucher.dto.js';

type DbNowRow = { now: Date };
export type VoucherRecord = Prisma.VoucherGetPayload<object>;

@Injectable()
export class VouchersService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeCode(code: string): string {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(normalized)) {
      throw new BadRequestException({ code: 'VOUCHER_INVALID_CODE' });
    }
    return normalized;
  }

  async dbNow(
    client: Pick<Prisma.TransactionClient, '$queryRaw'>,
  ): Promise<Date> {
    const [row] = await client.$queryRaw<
      DbNowRow[]
    >`SELECT clock_timestamp() AS "now"`;
    if (!row) throw new Error('Failed to read database time');
    return row.now;
  }

  async effectiveUsage(
    client: Pick<Prisma.TransactionClient, 'voucherClaim'>,
    voucherId: string,
    now: Date,
  ): Promise<number> {
    return client.voucherClaim.count({
      where: {
        voucherId,
        OR: [
          { status: VoucherClaimStatus.REDEEMED },
          { status: VoucherClaimStatus.RESERVED, expiresAt: { gt: now } },
        ],
      },
    });
  }

  async lockAndValidate(
    transaction: Prisma.TransactionClient,
    code: string,
    gross: bigint,
  ) {
    const rows = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "vouchers" WHERE "code" = ${this.normalizeCode(code)} FOR UPDATE
    `);
    if (!rows[0]) throw new ConflictException({ code: 'VOUCHER_NOT_FOUND' });
    const voucher = await transaction.voucher.findUniqueOrThrow({
      where: { id: rows[0].id },
    });
    const now = await this.dbNow(transaction);
    const result = await this.evaluate(transaction, voucher, gross, now);
    if (!result.valid) throw new ConflictException({ code: result.reason });
    return {
      voucher,
      discount: result.discountAmount,
      net: result.netTotalAmount,
      now,
    };
  }

  async evaluate(
    client: Pick<Prisma.TransactionClient, 'voucherClaim'>,
    voucher: VoucherRecord,
    gross: bigint,
    now: Date,
  ) {
    const zero = { discountAmount: 0n, netTotalAmount: gross };
    if (!voucher.isActive)
      return { valid: false, reason: 'VOUCHER_INACTIVE', ...zero };
    if (now < voucher.validFrom)
      return { valid: false, reason: 'VOUCHER_NOT_STARTED', ...zero };
    if (now >= voucher.validUntil)
      return { valid: false, reason: 'VOUCHER_EXPIRED', ...zero };
    const calculated = calculateVoucherDiscount(voucher, gross);
    if (!calculated.eligible)
      return { valid: false, reason: calculated.reason, ...zero };
    if (calculated.netTotalAmount === 0n)
      return { valid: false, reason: 'FREE_CHECKOUT_UNSUPPORTED', ...zero };
    if (
      (await this.effectiveUsage(client, voucher.id, now)) >= voucher.usageLimit
    ) {
      return { valid: false, reason: 'VOUCHER_LIMIT_REACHED', ...zero };
    }
    return {
      valid: true,
      reason: 'VALID',
      discountAmount: calculated.discountAmount,
      netTotalAmount: calculated.netTotalAmount,
    };
  }

  async preview(code: string, gross: bigint) {
    const normalized = this.normalizeCode(code);
    const voucher = await this.prisma.voucher.findUnique({
      where: { code: normalized },
    });
    if (!voucher)
      return {
        valid: false,
        reason: 'VOUCHER_NOT_FOUND',
        code: normalized,
        grossSubtotalAmount: gross.toString(),
        discountAmount: '0',
        netTotalAmount: gross.toString(),
      };
    const result = await this.evaluate(
      this.prisma,
      voucher,
      gross,
      await this.dbNow(this.prisma),
    );
    return {
      valid: result.valid,
      reason: result.reason,
      code: voucher.code,
      type: voucher.type,
      grossSubtotalAmount: gross.toString(),
      discountAmount: result.discountAmount.toString(),
      netTotalAmount: result.netTotalAmount.toString(),
    };
  }

  async create(dto: CreateVoucherDto) {
    const data = this.buildData(dto);
    try {
      const voucher = await this.prisma.voucher.create({
        data: { ...data, code: this.normalizeCode(dto.code) },
      });
      return this.detail(voucher.id);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException({ code: 'VOUCHER_CODE_EXISTS' });
      throw error;
    }
  }

  async list() {
    const vouchers = await this.prisma.voucher.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(vouchers.map((voucher) => this.present(voucher)));
  }

  async detail(id: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { id } });
    if (!voucher) throw new NotFoundException({ code: 'VOUCHER_NOT_FOUND' });
    return this.present(voucher);
  }

  async update(id: string, dto: UpdateVoucherDto) {
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT "id" FROM "vouchers" WHERE "id" = ${id}::uuid FOR UPDATE`,
      );
      if (!rows[0]) throw new NotFoundException({ code: 'VOUCHER_NOT_FOUND' });
      const current = await transaction.voucher.findUniqueOrThrow({
        where: { id },
      });
      const merged = {
        type: dto.type ?? current.type,
        fixedAmount:
          dto.fixedAmount === undefined
            ? (current.fixedAmount?.toString() ?? null)
            : dto.fixedAmount,
        percentageBps:
          dto.percentageBps === undefined
            ? current.percentageBps
            : dto.percentageBps,
        minOrderAmount: dto.minOrderAmount ?? current.minOrderAmount.toString(),
        maxDiscountAmount:
          dto.maxDiscountAmount === undefined
            ? (current.maxDiscountAmount?.toString() ?? null)
            : dto.maxDiscountAmount,
        validFrom: dto.validFrom ?? current.validFrom.toISOString(),
        validUntil: dto.validUntil ?? current.validUntil.toISOString(),
        usageLimit: dto.usageLimit ?? current.usageLimit,
        isActive: dto.isActive ?? current.isActive,
      };
      const data = this.buildData(merged);
      const now = await this.dbNow(transaction);
      if (data.usageLimit < (await this.effectiveUsage(transaction, id, now)))
        throw new ConflictException({ code: 'VOUCHER_LIMIT_BELOW_USAGE' });
      const updated = await transaction.voucher.update({ where: { id }, data });
      return this.present(updated, transaction, now);
    });
  }

  async deactivate(id: string) {
    return this.update(id, { isActive: false });
  }

  private buildData(dto: Omit<CreateVoucherDto, 'code'>) {
    const fixedAmount =
      dto.fixedAmount == null ? null : BigInt(dto.fixedAmount);
    const maxDiscountAmount =
      dto.maxDiscountAmount == null ? null : BigInt(dto.maxDiscountAmount);
    const minOrderAmount = BigInt(dto.minOrderAmount);
    const validFrom = new Date(dto.validFrom);
    const validUntil = new Date(dto.validUntil);
    if (
      !Number.isFinite(validFrom.getTime()) ||
      !Number.isFinite(validUntil.getTime()) ||
      validUntil <= validFrom ||
      dto.usageLimit <= 0 ||
      minOrderAmount < 0n ||
      (maxDiscountAmount !== null && maxDiscountAmount <= 0n)
    )
      throw new BadRequestException({ code: 'VOUCHER_INVALID_CONFIG' });
    if (
      (dto.type === VoucherType.FIXED &&
        (fixedAmount === null ||
          fixedAmount <= 0n ||
          dto.percentageBps != null)) ||
      (dto.type === VoucherType.PERCENTAGE &&
        (fixedAmount !== null ||
          dto.percentageBps == null ||
          !Number.isInteger(dto.percentageBps) ||
          dto.percentageBps < 1 ||
          dto.percentageBps > 10000))
    )
      throw new BadRequestException({ code: 'VOUCHER_INVALID_CONFIG' });
    return {
      type: dto.type,
      fixedAmount,
      percentageBps: dto.percentageBps ?? null,
      minOrderAmount,
      maxDiscountAmount,
      validFrom,
      validUntil,
      usageLimit: dto.usageLimit,
      isActive: dto.isActive ?? true,
    };
  }

  private async present(
    voucher: VoucherRecord,
    client: Pick<Prisma.TransactionClient, '$queryRaw' | 'voucherClaim'> = this
      .prisma,
    now?: Date,
  ) {
    const usage = await this.effectiveUsage(
      client,
      voucher.id,
      now ?? (await this.dbNow(client)),
    );
    return {
      id: voucher.id,
      code: voucher.code,
      type: voucher.type,
      fixedAmount: voucher.fixedAmount?.toString() ?? null,
      percentageBps: voucher.percentageBps,
      minOrderAmount: voucher.minOrderAmount.toString(),
      maxDiscountAmount: voucher.maxDiscountAmount?.toString() ?? null,
      validFrom: voucher.validFrom.toISOString(),
      validUntil: voucher.validUntil.toISOString(),
      usageLimit: voucher.usageLimit,
      effectiveUsage: usage,
      isActive: voucher.isActive,
      createdAt: voucher.createdAt.toISOString(),
      updatedAt: voucher.updatedAt.toISOString(),
    };
  }
}
