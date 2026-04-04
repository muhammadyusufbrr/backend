import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { UzumController } from './uzum.controller';
import { UzumService } from './uzum.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [HttpModule, PrismaModule],
  controllers: [UzumController],
  providers: [UzumService, EncryptionService],
})
export class UzumModule {}