-- Enable pg_cron extension for scheduled jobs
-- Note: pg_cron may not be available in all environments.
-- If unavailable, run archive_stale() manually or via external cron.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Run daily at 03:00 UTC: archive memories not accessed in 30 days
SELECT cron.schedule(
    'archive-stale-memories',
    '0 3 * * *',
    $$SELECT archive_stale()$$
);
