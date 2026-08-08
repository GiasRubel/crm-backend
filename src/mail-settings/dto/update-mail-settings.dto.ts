import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateMailSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  user?: string;

  /** Omit or leave blank to keep the currently saved password. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pass?: string;

  @IsOptional()
  @IsEmail()
  fromAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fromName?: string;
}
