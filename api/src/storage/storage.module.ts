import { Global, Module } from '@nestjs/common';
import { config } from '../config.js';
import { FILE_STORE, type FileStore } from './file-store.js';
import { S3Store } from './s3-store.js';
import { SupabaseStore } from './supabase-store.js';

/** Provides the FileStore chosen by STORAGE_DRIVER (supabase by default, or s3). */
export function createFileStore(): FileStore {
  switch (config.storage.driver) {
    case 'supabase':
      return new SupabaseStore(config.storage);
    case 's3':
      return new S3Store(config.storage);
    default:
      throw new Error(`STORAGE_DRIVER must be "supabase" or "s3", got "${config.storage.driver}"`);
  }
}

@Global()
@Module({ providers: [{ provide: FILE_STORE, useFactory: createFileStore }], exports: [FILE_STORE] })
export class StorageModule {}
