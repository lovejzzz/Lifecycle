/**
 * Store helpers — shared utilities used across multiple slices.
 * These are module-level functions/state that don't belong to any single slice.
 */

/** Agent activity logger — visible in browser console for debugging */
export const cidLog = (action: string, detail?: string | Record<string, unknown>) => {
  const ts = new Date().toISOString().slice(11, 23);
  const msg = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : '';
  console.log(`%c[CID ${ts}]%c ${action}${msg ? ' — ' + msg : ''}`, 'color: #10b981; font-weight: bold', 'color: inherit');
};
