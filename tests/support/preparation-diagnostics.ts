import { z } from 'zod';

// Public preparation launchers create these successful access changes. Keep
// this assertion contract independent of the production event serializer:
// unexpected fields, operations and non-success outcomes must remain visible.
const committed = {
  event: z.literal('security_operation'),
  schemaVersion: z.literal(1),
  reference: z.uuid(),
  operationReference: z.uuid(),
  at: z.iso.datetime(),
  outcome: z.literal('succeeded'),
  reason: z.literal('state_changed'),
  code: z.literal('committed'),
  stage: z.literal('mutation'),
  version: z.literal('development'),
  commit: z.literal('development'),
  actorId: z.uuid(),
  householdId: z.uuid(),
  targetId: z.uuid(),
};

const preparationSecurityEvent = z.discriminatedUnion('operation', [
  z
    .object({
      ...committed,
      operation: z.literal('invitation_create'),
      targetUserId: z.uuid(),
      replacedCount: z.literal(0),
    })
    .strict(),
  z
    .object({
      ...committed,
      operation: z.literal('invitation_accept'),
      targetUserId: z.uuid(),
      previousRole: z.literal('none'),
      role: z.literal('member'),
    })
    .strict(),
  z
    .object({
      ...committed,
      operation: z.literal('membership_remove'),
      previousRole: z.literal('member'),
      role: z.literal('none'),
    })
    .strict(),
  z
    .object({
      ...committed,
      operation: z.literal('grant_approve'),
      stage: z.literal('consent'),
      status: z.literal(200),
    })
    .strict(),
]);

/** Remove only validated preparation events, preserving all other diagnostics. */
export function unexpectedPreparationDiagnostics(output: string): string {
  return output
    .split(/(?<=\n)/u)
    .filter((line) => {
      try {
        return !preparationSecurityEvent.safeParse(JSON.parse(line)).success;
      } catch {
        return true;
      }
    })
    .join('');
}
