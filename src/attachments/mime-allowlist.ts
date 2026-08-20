/**
 * What an attachment is allowed to be.
 *
 * A CRM attaches documents to records — it is not a general file host. Anything
 * the browser will *execute* or *render as a document in our own origin* (HTML,
 * SVG, XML) is excluded: `download` echoes the stored `mimeType` straight back
 * as `Content-Type`, so an allowed `text/html` would be a stored-XSS primitive
 * against every user who opens the attachment.
 */
export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  // Plain text and data
  'text/plain',
  'text/csv',
  'application/json',
  // Images — note the deliberate absence of image/svg+xml, which is scriptable
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-7z-compressed',
  'application/vnd.rar',
]);

/**
 * A browser-safe `Content-Type` for serving stored bytes back.
 *
 * Even an allowlisted type is only echoed when we are confident the browser
 * will not run it; everything else is downgraded to a generic binary stream so
 * it downloads instead of rendering. Paired with `X-Content-Type-Options:
 * nosniff` this closes the "upload a file, get script execution on our origin"
 * path regardless of what the client claimed at upload time.
 */
const INLINE_SAFE = new Set([
  'application/pdf',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
]);

export function safeContentType(mimeType: string): string {
  return INLINE_SAFE.has(mimeType) ? mimeType : 'application/octet-stream';
}
