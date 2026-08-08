import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Plan } from '@prisma/client';

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsIn(['free', 'pro', 'business'])
  plan?: Plan;
}

export class UpdateWorkspaceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}