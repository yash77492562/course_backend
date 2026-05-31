import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EncryptionService } from './encryption/service';
import { Argon2Service } from './argon2/service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [EncryptionService, Argon2Service],
  exports: [EncryptionService, Argon2Service],
})
export class SecurityModule {}
