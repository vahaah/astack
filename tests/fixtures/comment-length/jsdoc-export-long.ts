/**
 * Opens a session against the storage service.
 * The session holds one connection for its lifetime.
 * Calls made after close() reject with SessionClosedError.
 * Retries apply only to idempotent reads.
 * Writes fail fast so the caller decides whether to replay them.
 * Credentials come from the environment when options.credentials is absent.
 * Rotated credentials take effect on the next session.
 * The handshake times out after options.timeoutMs.
 * A timed-out handshake leaves no connection open.
 * Sessions are not safe to share across workers.
 * Each worker opens its own session at startup.
 * @param options connection and retry settings
 * @returns an open session
 * @throws SessionError when the handshake fails
 */
export function openSession(options: SessionOptions): Session {}
