import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { PublishProcessor } from './publish.processor';
import { PublishingService } from './publishing.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('redisUrl') },
      }),
    }),
    BullModule.registerQueue({ name: 'publish' }, { name: 'refresh-tokens' }),
  ],
  providers: [PublishingService, PublishProcessor],
  exports: [PublishingService],
})
export class PublishingModule {}
