import { ALLOWED_MIME_TYPES, safeContentType } from './mime-allowlist';

describe('ALLOWED_MIME_TYPES', () => {
  it.each([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/csv',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ])('accepts %s', (type) => {
    expect(ALLOWED_MIME_TYPES.has(type)).toBe(true);
  });

  it.each([
    ['HTML — stored XSS if served back', 'text/html'],
    ['SVG — scriptable image', 'image/svg+xml'],
    ['XHTML', 'application/xhtml+xml'],
    ['XML — XXE / rendering surface', 'text/xml'],
    ['JavaScript', 'application/javascript'],
    ['a shell script', 'application/x-sh'],
    ['a Windows executable', 'application/x-msdownload'],
    ['a PHP script', 'application/x-httpd-php'],
  ])('rejects %s (%s)', (_label, type) => {
    expect(ALLOWED_MIME_TYPES.has(type)).toBe(false);
  });

  it('rejects an unknown type rather than defaulting to allowed', () => {
    expect(ALLOWED_MIME_TYPES.has('application/x-not-a-real-type')).toBe(false);
  });
});

describe('safeContentType', () => {
  it.each([
    'application/pdf',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
  ])('echoes %s, which browsers render harmlessly', (type) => {
    expect(safeContentType(type)).toBe(type);
  });

  it.each([
    // Allowlisted for upload, but must still download rather than render.
    ['a Word document', 'application/msword'],
    ['a zip archive', 'application/zip'],
    ['CSV', 'text/csv'],
    ['JSON', 'application/json'],
    // Never allowlisted, but the header path must be safe regardless of how the
    // stored value got there — including rows written before the allowlist.
    ['HTML', 'text/html'],
    ['SVG', 'image/svg+xml'],
    ['an empty string', ''],
  ])('downgrades %s (%s) to a binary stream', (_label, type) => {
    expect(safeContentType(type)).toBe('application/octet-stream');
  });
});
