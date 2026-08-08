import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AuthService, REFRESH_COOKIE, SessionResult } from './auth.service';
import { LoginDto, SignupDto } from './dto';

const REFRESH_PATH = '/api/auth';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    return this.setRefreshCookie(res, await this.auth.signup(dto));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.setRefreshCookie(res, await this.auth.login(dto));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    return this.setRefreshCookie(res, await this.auth.refresh(token));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User) {
    return user;
  }

  private setRefreshCookie(res: Response, session: SessionResult) {
    const ttlSeconds = this.config.get<number>('refreshTokenTtl')!;
    const secure = this.config.get<string>('nodeEnv') === 'production';
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: REFRESH_PATH,
      maxAge: ttlSeconds * 1000,
    });
    const { refreshToken: _rt, ...rest } = session;
    return rest;
  }
}