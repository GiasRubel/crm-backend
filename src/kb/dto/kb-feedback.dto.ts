import { Type } from 'class-transformer';
import { IsBoolean } from 'class-validator';

/** Anonymous "was this article helpful?" vote from the public FAQ. */
export class KbFeedbackDto {
  @IsBoolean()
  @Type(() => Boolean)
  helpful: boolean;
}
