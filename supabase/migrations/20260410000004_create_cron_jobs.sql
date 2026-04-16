-- Enable pg_cron extension for scheduled jobs.
-- pg_cron is available on Supabase but not on vanilla PostgreSQL (e.g. Docker).
-- When unavailable, this block logs a NOTICE and continues gracefully.
-- In that case, run SELECT archive_stale() manually or via an external cron.
DO $body$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    -- Run daily at 03:00 UTC: archive memories not accessed in 30 days
    PERFORM cron.schedule(
        'archive-stale-memories',
        '0 3 * * *',
        $$SELECT archive_stale()$$
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available: %. Skipping cron job setup.', SQLERRM;
    RAISE NOTICE 'Run SELECT archive_stale() manually or via external cron.';
END;
$body$;
