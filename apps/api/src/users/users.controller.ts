import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PrismaService } from '../common/prisma/prisma.service';

class SearchQueryDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

/** Lightweight user lookup (e.g. invite autocomplete). Never returns hashes. */
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('search')
  search(@Query() query: SearchQueryDto) {
    const q = (query.q ?? query.email ?? '').toLowerCase();
    if (!q) {
      return [];
    }
    return this.prisma.user.findMany({
      where: {
        OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }],
      },
      select: { id: true, email: true, name: true },
      take: 20,
    });
  }
}