export type UploadImageInput = {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  folder?: string;
};

export type StoredImage = {
  provider: string;
  storageKey: string;
  url: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
};

export interface FileStorageProvider {
  uploadImage(input: UploadImageInput): Promise<StoredImage>;
  deleteImage(storageKey: string): Promise<void>;
}
