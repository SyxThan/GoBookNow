import { BadRequestException } from '@nestjs/common';

export const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_APPLICATION = 5;
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

export type AllowedDocumentMimeType =
  (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

export type UploadedDocumentFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export function isAllowedDocumentMimeType(
  mimeType: string,
): mimeType is AllowedDocumentMimeType {
  return ALLOWED_DOCUMENT_MIME_TYPES.includes(
    mimeType as AllowedDocumentMimeType,
  );
}

export function hasValidDocumentSignature(file: UploadedDocumentFile): boolean {
  const bytes = file.buffer;
  if (file.mimetype === 'application/pdf') {
    return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  if (file.mimetype === 'image/jpeg') {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (file.mimetype === 'image/png') {
    const signature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    return bytes.subarray(0, signature.length).equals(signature);
  }
  return false;
}

export function validateUploadedDocument(
  file?: UploadedDocumentFile,
): asserts file is UploadedDocumentFile {
  if (!file) throw new BadRequestException('Document file is required');
  if (!isAllowedDocumentMimeType(file.mimetype)) {
    throw new BadRequestException(
      'Only PDF, JPEG, and PNG documents are allowed',
    );
  }
  if (file.size <= 0 || file.size > MAX_DOCUMENT_SIZE) {
    throw new BadRequestException('Document must be between 1 byte and 5 MB');
  }
  if (!hasValidDocumentSignature(file)) {
    throw new BadRequestException(
      'Document content does not match its declared type',
    );
  }
}
