import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

@Injectable()
export class Argon2Service {
  private readonly hashLength: number;
  private readonly timeCost: number;
  private readonly memoryCost: number;
  private readonly parallelism: number;

  constructor(private configService: ConfigService) {
    // All values from ENV - no hardcoding
    this.hashLength = parseInt(this.configService.get<string>('ARGON2_HASH_LENGTH') || '32');
    this.timeCost = parseInt(this.configService.get<string>('ARGON2_TIME_COST') || '3');
    this.memoryCost = parseInt(this.configService.get<string>('ARGON2_MEMORY_COST') || '65536');
    this.parallelism = parseInt(this.configService.get<string>('ARGON2_PARALLELISM') || '4');
  }

  /**
   * Hash password using Argon2id (most secure variant)
   */
  async hashPassword(password: string): Promise<string> {
    try {
      return await argon2.hash(password, {
        hashLength: this.hashLength,
        timeCost: this.timeCost,
        memoryCost: this.memoryCost,
        parallelism: this.parallelism,
      });
    } catch (error) {
      console.error('Password hashing error:', error);
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }

  /**
   * Check if hash needs rehashing (if params changed)
   */
  async needsRehash(hash: string): Promise<boolean> {
    try {
      return argon2.needsRehash(hash, {
        timeCost: this.timeCost,
        memoryCost: this.memoryCost,
        parallelism: this.parallelism,
      });
    } catch (error) {
      return false;
    }
  }
}
