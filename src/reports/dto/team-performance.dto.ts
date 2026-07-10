import { RepPerformanceDto } from './dashboard-response.dto';

export class TeamPerformanceRowDto {
  teamId: string;
  teamName: string;
  memberCount: number;
  wonCount: number;
  wonValue: number;
  openCount: number;
  openValue: number;
  winRate: number;
}

export class TeamPerformanceResponseDto {
  /** Per-rep leaderboard (record owners), sorted by won value desc. */
  reps: RepPerformanceDto[];
  /** Per-team rollup, sorted by won value desc. */
  teams: TeamPerformanceRowDto[];
}
