import { IsIn } from 'class-validator';
import { ACTIVITY_STATUSES } from '../activity.schema';
import type { ActivityStatus } from '../activity.schema';

/** Complete, reopen, or cancel an activity. */
export class SetActivityStatusDto {
  @IsIn(ACTIVITY_STATUSES)
  status: ActivityStatus;
}
