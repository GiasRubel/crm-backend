import { IsOptional, IsString } from 'class-validator';

export class SetCustomRoleDto {
  /** null clears the custom role, restoring the legacy full-access default. */
  @IsString()
  @IsOptional()
  customRoleId?: string | null;
}
