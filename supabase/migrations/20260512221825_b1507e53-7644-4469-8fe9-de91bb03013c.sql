
-- Push subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;

create policy "push_select_own_or_admin" on public.push_subscriptions
  for select using (user_id = auth.uid() or has_role(auth.uid(), 'superadmin'::app_role));
create policy "push_insert_own" on public.push_subscriptions
  for insert with check (user_id = auth.uid());
create policy "push_delete_own" on public.push_subscriptions
  for delete using (user_id = auth.uid());
create policy "push_update_own" on public.push_subscriptions
  for update using (user_id = auth.uid());

-- Server-side evaluation of notification rules
create or replace function public.evaluate_notification_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  raw_num numeric;
  raw_text text;
  matched boolean;
  cd interval;
begin
  for r in
    select nr.* from public.notification_rules nr
    where nr.site_id = NEW.site_id and nr.enabled = true
  loop
    cd := make_interval(mins => coalesce(r.cooldown_minutes, 0));
    if r.last_triggered_at is not null and (now() - r.last_triggered_at) < cd then
      continue;
    end if;

    matched := false;
    raw_num := null;
    raw_text := null;

    -- Pull the metric value out of NEW.* using a small case
    case r.metric
      when 'battery_capacity' then raw_num := NEW.battery_capacity;
      when 'battery_voltage' then raw_num := NEW.battery_voltage;
      when 'pv_input_power' then raw_num := NEW.pv_input_power;
      when 'ac_output_active_power' then raw_num := NEW.ac_output_active_power;
      when 'load_percent' then raw_num := NEW.load_percent;
      when 'grid_voltage' then raw_num := NEW.grid_voltage;
      when 'grid_frequency' then raw_num := NEW.grid_frequency;
      when 'ac_output_voltage' then raw_num := NEW.ac_output_voltage;
      when 'inverter_temperature' then raw_num := NEW.inverter_temperature;
      when 'inverter_mode' then raw_text := NEW.inverter_mode;
      when 'device_status' then raw_text := NEW.device_status;
      else continue;
    end case;

    if raw_num is not null and r.threshold is not null then
      matched := case r.operator
        when '<' then raw_num < r.threshold
        when '<=' then raw_num <= r.threshold
        when '>' then raw_num > r.threshold
        when '>=' then raw_num >= r.threshold
        when '=' then raw_num = r.threshold
        when '==' then raw_num = r.threshold
        when '!=' then raw_num <> r.threshold
        else false
      end;
    elsif raw_text is not null and r.threshold_text is not null then
      matched := case r.operator
        when '==' then raw_text = r.threshold_text
        when '=' then raw_text = r.threshold_text
        when 'changes_to' then raw_text = r.threshold_text
        when '!=' then raw_text <> r.threshold_text
        else false
      end;
    end if;

    if matched then
      insert into public.notification_events
        (user_id, site_id, rule_id, title, body, severity, metric, value, value_text)
      values
        (r.user_id, r.site_id, r.id,
         coalesce(r.name, r.metric),
         r.metric || ' ' || r.operator || ' ' || coalesce(r.threshold::text, r.threshold_text, '') ||
            ' (actual: ' || coalesce(raw_num::text, raw_text, '') || ')',
         r.severity, r.metric, raw_num, raw_text);

      update public.notification_rules
        set last_triggered_at = now()
        where id = r.id;
    end if;
  end loop;
  return NEW;
end;
$$;

drop trigger if exists telemetry_evaluate_rules on public.telemetry_samples;
create trigger telemetry_evaluate_rules
after insert on public.telemetry_samples
for each row execute function public.evaluate_notification_rules();

-- Push dispatch via pg_net (best effort: only if extension exists)
create or replace function public.dispatch_push_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  base_url text := 'https://project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app';
begin
  begin
    perform net.http_post(
      url := base_url || '/api/public/push-dispatch',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object('event_id', NEW.id::text)
    );
  exception when others then
    -- pg_net not available or call failed; ignore so insert still succeeds
    null;
  end;
  return NEW;
end;
$$;

drop trigger if exists notify_dispatch_push on public.notification_events;
create trigger notify_dispatch_push
after insert on public.notification_events
for each row execute function public.dispatch_push_event();
