import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Unauthenticated lead ingestion (public web form / external API).
 * Deliberately narrower than CreateLeadDto: no routing, scoring, or value
 * fields — anonymous callers must not influence internal data.
 */
export class CaptureLeadDto {
  /** Which organization's CRM this submission belongs to. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  organizationSlug: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  @Matches(/^\+?[0-9\s().-]{6,}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  company?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  message?: string;

  /**
   * Region tag used for territory auto-routing (matched against team
   * regions, case-insensitive). Unknown regions leave the lead unrouted.
   */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  region?: string;

  /** Where the submission came from. Only these two are accepted publicly. */
  @IsIn(['web_form', 'api'])
  @IsOptional()
  source?: 'web_form' | 'api';

  /**
   * Honeypot. Real users never fill this hidden field; bots do. Submissions
   * with a value are silently discarded (the endpoint still returns 202).
   */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  website?: string;
}
