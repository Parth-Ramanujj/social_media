import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { configuration } from './config/configuration';
import { PrismaModule } from './common/prisma/prisma.module';
import { EncryptionModule } from './common/encryption/encryption.module';
import { AuditModule } from './common/audit/audit.module';
import { NotificationsModule } from './common/notifications/notifications.module';
import { MailerModule } from './common/mailer/mailer.module';
import { HealthModule } from './common/health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { MembersModule } from './members/members.module';
import { InvitationsModule } from './invitations/invitations.module';
import { PostsModule } from './posts/posts.module';
import { PublishingModule } from './publishing/publishing.module';
import { OauthModule } from './oauth/oauth.module';
import { InboxModule } from './inbox/inbox.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120, // 120 requests/min per IP across the API
      },
    ]),
    PrismaModule,
    EncryptionModule,
    AuditModule,
    NotificationsModule,
    MailerModule,
    HealthModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    MembersModule,
    InvitationsModule,
    PostsModule,
    PublishingModule,
    OauthModule,
    InboxModule,
    AnalyticsModule,
    WebhooksModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // API-wide rate limiting
    },
  ],
})
export class AppModule {}