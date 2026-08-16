import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Platform } from '@pulse/shared-types';
import { WebhooksService } from './webhooks.service';

/**
 * Public webhook endpoints for Meta (Graph API + WhatsApp Cloud API).
 *
 * GET  = subscription verification handshake (hub.mode / hub.verify_token / hub.challenge)
 * POST = event delivery, signed X-Hub-Signature-256, persisted idempotently,
 *        processed async via BullMQ. Always answers fast (Meta requires 200
 *        promptly); never blocks on downstream work.
 *
 * No auth guards by design — authenticity is the HMAC signature. Rate limit
 * is skipped: Meta may burst deliveries and the global 120/min/IP guard would
 * drop events.
 */
@Controller('webhooks')
@SkipThrottle()
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get(':platform')
  verify(
    @Req() req: Request,
    @Res() res: Response,
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ) {
    if (mode !== 'subscribe') {
      throw new BadRequestException('Expected hub.mode=subscribe');
    }
    const platform = req.params.platform as Platform;
    if (!this.webhooks.isValidVerifyToken(platform, token)) {
      throw new UnauthorizedException('Invalid verify token');
    }
    // Meta expects the raw challenge echoed back (plain text, not JSON).
    res.setHeader('Content-Type', 'text/plain');
    res.send(challenge ?? '');
  }

  @Post(':platform')
  async receive(@Req() req: RawBodyRequest<Request>) {
    const platform = req.params.platform as Platform;
    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Missing body');
    }
    const signature = req.header('x-hub-signature-256') ?? '';
    if (!this.webhooks.verifySignature(platform, rawBody, signature)) {
      throw new UnauthorizedException('Invalid signature');
    }
    const accepted = await this.webhooks.ingest(platform, rawBody);
    return { received: true, processed: accepted };
  }
}
