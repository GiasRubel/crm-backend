/** One grouped row of an aggregate report. */
export class ReportAggregateRow {
  /** The group key value (enum value, id, or truncated date ISO string). */
  group: string | number | null;
  /** Human-friendly label (staff/team name for id groups, else the value). */
  groupLabel: string;
  /** Metric alias → numeric value. */
  metrics: Record<string, number>;
}

/** Result of running a Custom Report. Discriminated by `mode`. */
export class ReportResultDto {
  mode: 'rows' | 'aggregate';
  dataset: string;

  // ── mode === 'rows' ──────────────────────────────────────────────────────
  columns?: string[];
  rows?: Record<string, unknown>[];
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };

  // ── mode === 'aggregate' ─────────────────────────────────────────────────
  groupBy?: string;
  groupByGranularity?: string;
  metricAliases?: string[];
  aggregate?: ReportAggregateRow[];
}
