export class ImportRowError {
  row!: number;
  message!: string;
}

export class ImportResultDto {
  created!: number;
  failed!: number;
  errors!: ImportRowError[];
}

export const MAX_IMPORT_ROWS = 1000;

/** Runs `handler` over each record, isolating failures so one bad row never aborts the batch. */
export async function runImport(
  records: Record<string, string>[],
  handler: (record: Record<string, string>, row: number) => Promise<void>,
): Promise<ImportResultDto> {
  const errors: ImportRowError[] = [];
  let created = 0;
  for (let i = 0; i < records.length; i++) {
    const row = i + 2; // +1 for 0-index, +1 for the header row
    try {
      await handler(records[i], row);
      created++;
    } catch (error) {
      errors.push({
        row,
        message: error instanceof Error ? error.message : 'Import failed',
      });
    }
  }
  return { created, failed: errors.length, errors };
}
