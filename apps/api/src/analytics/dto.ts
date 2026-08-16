import { Type } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export class AnalyticsRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  days?: number;
}

export class MockAnalyticsQueryDto {
  @IsOptional()
  @Type(() => Number)
  days?: number;

  @IsOptional()
  @IsString()
  accountId?: string;
}
