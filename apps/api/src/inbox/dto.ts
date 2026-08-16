import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ListInboxQueryDto {
  @IsOptional()
  @IsIn(['comment', 'dm'])
  type?: string;

  @IsOptional()
  @IsIn(['unassigned', 'assigned', 'resolved'])
  status?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  offset?: number;
}

export class UpdateInboxDto {
  @IsOptional()
  @IsIn(['unassigned', 'assigned', 'resolved'])
  status?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string | null;
}

export class ReplyInboxDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}

export class MockInboxQueryDto {
  @IsOptional()
  @Type(() => Number)
  count?: number;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsDateString()
  since?: string;
}
