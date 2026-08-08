import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Platform } from '@pulse/shared-types';
import type { SocialProvider } from './social-provider.interface';

/**
 * Registry of all SocialProvider implementations.
 * Providers register themselves here in their constructor (via setter) or are
 * added explicitly in OauthModule. A provider without app credentials stays
 * registered but runs in DRY-RUN mode (all BaseProvider methods return
 * synthetic results), keeping the full pipeline testable pre-approval.
 */
@Injectable()
export class ProviderRegistry {
  private readonly providers = new Map<Platform, SocialProvider>();

  register(provider: SocialProvider) {
    this.providers.set(provider.platform, provider);
  }

  get(platform: Platform): SocialProvider {
    const provider = this.providers.get(platform);
    if (!provider) {
      throw new ServiceUnavailableException(
        `${platform} integration is not configured. Set ${platform.toUpperCase()}_ENABLED=true and the app credentials in .env`,
      );
    }
    return provider;
  }

  has(platform: Platform): boolean {
    return this.providers.has(platform);
  }

  list(): SocialProvider[] {
    return [...this.providers.values()];
  }
}