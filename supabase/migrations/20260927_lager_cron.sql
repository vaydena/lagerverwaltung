-- Täglich 04:30 UTC: Mindestbestand-Übersicht per Mail (lager-public, Aktion cron_low_stock).
-- Die Function begrenzt selbst: höchstens eine Mail je Mandant und Tag.
select cron.unschedule(jobid) from cron.job where jobname = 'lager-low-stock';
select cron.schedule('lager-low-stock', '30 4 * * *', $$select net.http_post(url:='https://xeuexovdipdiiuzjpzkj.supabase.co/functions/v1/lager-public', headers:='{"Content-Type":"application/json"}'::jsonb, body:='{"action":"cron_low_stock"}'::jsonb)$$);
