import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoginDto, SignupDto } from './dto';

export const REFRESH_COOKIE = 'pulse_refresh';

export interface SessionResult {
  user: Pick<User, 'id' | 'email' | 'name' | 'createdAt'>;
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signup(dto: SignupDto): Promise<SessionResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: dto.email, passwordHash, name: dto.name },
      });
      const workspace = await tx.workspace.create({
        data: { name: `${dto.name}'s Workspace` },
      });
      await tx.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: created.id, role: 'owner' },
      });
      return created;
    });

    return this.issueSession(user);
  }

  async login(dto: LoginDto): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueSession(user);
  }

  /** Rotates the session: revokes the presented refresh token, mints a new pair. */
  async refresh(refreshToken: string): Promise<SessionResult> {
    const tokenHash = hashToken(refreshToken);
    const session = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      throw new UnauthorizedException('Account not found');
    }
    await this.prisma.refreshToken.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return this.issueSession(user);
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
  }

  private async issueSession(user: User): Promise<SessionResult> {
    const accessTtl = this.config.get<number>('accessTokenTtl')!;
    const refreshTtl = this.config.get<number>('refreshTokenTtl')!;

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      { expiresIn: accessTtl },
    );

    const refreshToken = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return {
      user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
      accessToken,
      accessTokenExpiresIn: accessTtl,
      refreshToken,
    };
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}