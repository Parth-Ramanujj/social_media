import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class VariantInputDto {
  @IsString()
  @MinLength(1)
  socialAccountId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  contentText: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  mediaUrls?: string[];

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class CreatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsBoolean()
  needsApproval?: boolean;

  @IsOptional()
  @IsIn(['draft', 'scheduled', 'queued'])
  status?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => VariantInputDto)
  variants: VariantInputDto[];
}

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  contentText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => UpdateVariantDto)
  variants?: Record<string, UpdateVariantDto>;
}

export class ImportPostItemDto {
  @IsString()
  socialAccountId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  contentText: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsBoolean()
  needsApproval?: boolean;
}

export class ListPostsQueryDto {
  @IsOptional()
  @IsIn(['draft', 'queued', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  offset?: number;
}