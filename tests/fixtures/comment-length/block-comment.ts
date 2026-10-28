/*
 * Retry budget for the export worker. The worker shares a connection
 * pool with the web tier, so a long retry storm starves page loads.
 * Five attempts keep the worst case under the pool's idle timeout.
 * Raise it only together with the pool size.
 * See the capacity notes for the numbers.
 */
const RETRY_BUDGET = 5;
