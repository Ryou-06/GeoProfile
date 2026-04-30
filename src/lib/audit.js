import { auth, db } from '$lib/firebase';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';

/**
 * @typedef {Record<string, unknown>} LooseRecord
 * @typedef {{
 *   actorId?: string | null;
 *   actorName?: string | null;
 *   actorRole?: string | null;
 *   actorEmail?: string | null;
 * }} AuditActor
 * @typedef {AuditActor & {
 *   action: string;
 *   module: string;
 *   description: string;
 *   targetId?: string | null;
 *   targetLabel?: string | null;
 *   status?: string;
 *   severity?: string;
 *   changes?: LooseRecord | null;
 *   metadata?: LooseRecord | null;
 * }} AuditEvent
 */

/** @param {AuditActor} override */
async function getActor(override = {}) {
  if (override.actorName || override.actorId) return override;

  const user = auth.currentUser;
  if (!user) {
    return {
      actorId: null,
      actorName: 'Public user',
      actorRole: 'public',
      actorEmail: null
    };
  }

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const data = snap.exists() ? snap.data() : {};
    return {
      actorId: user.uid,
      actorName: data.name || user.displayName || data.username || user.email || 'Unknown user',
      actorRole: data.role || 'user',
      actorEmail: data.email || user.email || null
    };
  } catch {
    return {
      actorId: user.uid,
      actorName: user.displayName || user.email || 'Unknown user',
      actorRole: 'user',
      actorEmail: user.email || null
    };
  }
}

/** @param {LooseRecord} before @param {LooseRecord} after */
export function pickChangedFields(before = {}, after = {}) {
  /** @type {Record<string, { oldValue: unknown; newValue: unknown }>} */
  const changes = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  keys.forEach((key) => {
    const oldValue = before[key] ?? null;
    const newValue = after[key] ?? null;
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = { oldValue, newValue };
    }
  });

  return changes;
}

/** @param {AuditEvent} event */
export async function logAuditEvent(event) {
  try {
    const actor = await getActor(event);
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;

    await addDoc(collection(db, 'auditLogs'), {
      action: event.action,
      module: event.module,
      description: event.description,
      targetId: event.targetId ?? null,
      targetLabel: event.targetLabel ?? null,
      status: event.status ?? 'success',
      severity: event.severity ?? 'info',
      changes: event.changes ?? null,
      metadata: event.metadata ?? null,
      actorId: actor.actorId ?? null,
      actorName: actor.actorName ?? 'Unknown user',
      actorRole: actor.actorRole ?? 'user',
      actorEmail: actor.actorEmail ?? null,
      userAgent,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn('Audit log was not saved:', error);
  }
}
