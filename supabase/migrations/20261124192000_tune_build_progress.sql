-- Step-by-step progress of an in-app tune build, shown in the upload dialog.
alter table public.tune_build_jobs add column if not exists progress jsonb not null default '[]'::jsonb;
