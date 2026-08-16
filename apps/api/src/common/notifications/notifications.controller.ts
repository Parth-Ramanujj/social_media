import { Controller, Get, Param, Post, Query, Sse, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: User) {
    return this.notifications.listForUser(user.id);
  }

  /**
   * Live stream for the bell: EventSource cannot set Authorization headers,
   * so the access token travels as a query param (verified exactly like the
   * Bearer token). Emits `notification.created` / `notifications.updated`
   * events plus a ping heartbeat every 25s.
   */
  @Sse('stream')
  stream(@Query('token') token?: string): Observable<MessageEvent> {
    let userId: string;
    try {
      const payload = this.jwt.verify(token ?? '', {
        secret: this.config.get<string>('jwtAccessSecret'),
      }) as { sub: string };
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid stream token');
    }
    return new Observable<MessageEvent>((subscriber) => {
      const heartbeat = setInterval(
        () => subscriber.next({ type: 'ping', data: { ts: Date.now() } } as MessageEvent),
        25_000,
      );
      const unsubscribe = this.notifications.subscribe(userId, (event) => {
        subscriber.next({ type: event.kind, data: event } as MessageEvent);
      });
      return () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    });
  }

  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  async unreadCount(@CurrentUser() user: User) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Post(':id/read')
  @UseGuards(JwtAuthGuard)
  markRead(@CurrentUser() user: User, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @UseGuards(JwtAuthGuard)
  readAll(@CurrentUser() user: User) {
    return this.notifications.markAllRead(user.id);
  }
}
