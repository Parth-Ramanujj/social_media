import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { Role } from '@pulse/shared-types';

export class CreateInvitationDto {
  @IsEmail()
  email: string;

  @IsIn(['admin', 'editor', 'viewer'])
  role: Role;
}

export class AcceptInvitationDto {
  @IsString()
  @MinLength(32)
  token: string;
}