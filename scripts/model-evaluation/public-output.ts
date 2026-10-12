import { createHash } from 'node:crypto';

/** Provider session IDs resemble access tokens to secret scanners. Keep stable
 * correlation in public evidence; raw identities stay in private records. */
export function publicEvaluationText(text: string): string {
  return text.replace(
    /\blive_[A-Za-z0-9_-]+\b/g,
    (id) => `session-sha256-${createHash('sha256').update(id).digest('hex')}`,
  );
}
