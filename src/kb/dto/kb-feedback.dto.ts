import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Anonymous "was this article helpful?" vote from the public FAQ. */
export class KbFeedbackDto {
  /** Which organisation's FAQ the vote came from — see PublicKbQueryDto. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  organizationSlug: string;

  @IsBoolean()
  @Type(() => Boolean)
  helpful: boolean;
}
