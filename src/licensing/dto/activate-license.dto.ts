import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ActivateLicenseDto {
  @IsString()
  @IsNotEmpty()
  purchaseCode: string;

  @IsString()
  @IsOptional()
  domain?: string;
}
