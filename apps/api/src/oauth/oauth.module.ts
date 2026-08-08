import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OauthController } from './oauth.controller';
import { OauthService } from './oauth.service';
import { ProviderRegistry } from './provider-registry.service';
import { MetaProvider } from './providers/meta/meta.provider';
import { XProvider } from './providers/x/x.provider';
import { LinkedInProvider } from './providers/linkedin/linkedin.provider';
import { YouTubeProvider } from './providers/youtube/youtube.provider';
import { PinterestProvider } from './providers/pinterest/pinterest.provider';
import { TikTokProvider } from './providers/tiktok/tiktok.provider';

/**
 * Social platform integrations. Every platform implements SocialProvider and
 * self-registers in ProviderRegistry. Without app credentials a provider runs
 * in DRY-RUN mode (see base.provider.ts) so the full pipeline stays testable.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.get<string>('jwtAccessSecret') }),
    }),
  ],
  controllers: [OauthController],
  providers: [
    OauthService,
    ProviderRegistry,
    MetaProvider,
    XProvider,
    LinkedInProvider,
    YouTubeProvider,
    PinterestProvider,
    TikTokProvider,
  ],
  exports: [OauthService, ProviderRegistry],
})
export class OauthModule {}