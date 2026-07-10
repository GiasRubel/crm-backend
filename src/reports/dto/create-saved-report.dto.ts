import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { RunReportDto } from './run-report.dto';

/**
 * Persist a report definition. Extends the runnable definition with a name,
 * optional description, and a share flag. `page`/`limit` are inherited but
 * only meaningful when the report is later run.
 */
export class CreateSavedReportDto extends RunReportDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  shared?: boolean;
}
