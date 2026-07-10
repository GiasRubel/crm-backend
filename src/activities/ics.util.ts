import { ActivityDocument } from './activity.schema';

/** RFC 5545 requires escaping backslash, semicolon, comma, and newlines. */
function escapeIcsText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** UTC basic format: 20260710T143000Z */
function toIcsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Lines over 75 octets must be folded (CRLF + single space). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = ' ' + rest.slice(75);
  }
  parts.push(rest);
  return parts.join('\r\n');
}

/**
 * Render an activity as an iCalendar (.ics) event — importable into
 * Google Calendar, Outlook, and Exchange. Timed activities use
 * startAt/endAt; tasks fall back to dueAt with a 30-minute block.
 */
export function activityToIcs(activity: ActivityDocument): string {
  const start = activity.startAt ?? activity.dueAt;
  if (!start) {
    throw new Error('Activity has no startAt or dueAt to export');
  }
  const end = activity.endAt ?? new Date(start.getTime() + 30 * 60 * 1000);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CRM//Activities//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:crm-activity-${activity._id.toString()}@crm`,
    `DTSTAMP:${toIcsDate(new Date(activity.updatedAt ?? new Date()))}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(activity.subject)}`,
    ...(activity.description
      ? [`DESCRIPTION:${escapeIcsText(activity.description)}`]
      : []),
    `STATUS:${activity.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join('\r\n') + '\r\n';
}
