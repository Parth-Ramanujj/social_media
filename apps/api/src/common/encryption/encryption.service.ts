import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

/**
 * AES-256-GCM encryption for OAuth tokens at rest.
 * Format: base64(iv) : base64(authTag) : base64(ciphertext)
 * Decrypt only in-memory at call time — never persist plaintext tokens.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.get<string>('tokenEncryptionKey')!, 'base64');
    if (this.key.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be a 32-byte (256-bit) key encoded as base64');
    }
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Malformed encrypted payload');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  }
}