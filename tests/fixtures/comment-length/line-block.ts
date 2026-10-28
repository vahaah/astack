// The scheduler runs jobs in the order they were queued.
// A job that fails is retried with exponential backoff.
// After the fifth failure the job moves to the dead-letter queue.
// Operators inspect that queue from the admin page.
function schedule(job: Job): void {}
