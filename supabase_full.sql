

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "admin";


ALTER SCHEMA "admin" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."alert_event_type" AS ENUM (
    'breach',
    'recovery'
);


ALTER TYPE "public"."alert_event_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "admin"."_job_touch"("p_jobname" "text", "p_started" boolean DEFAULT false, "p_success" boolean DEFAULT false, "p_error" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  insert into admin.job_heartbeats(jobname, last_started_at, last_succeeded_at, last_failed_at, last_error)
  values (
    p_jobname,
    case when p_started then now() end,
    case when p_success then now() end,
    case when not p_success and p_error is not null then now() end,
    p_error
  )
  on conflict (jobname) do update
  set last_started_at   = case when p_started then now() else admin.job_heartbeats.last_started_at end,
      last_succeeded_at = case when p_success then now() else admin.job_heartbeats.last_succeeded_at end,
      last_failed_at    = case when not p_success and p_error is not null then now() else admin.job_heartbeats.last_failed_at end,
      last_error        = p_error;
end
$$;


ALTER FUNCTION "admin"."_job_touch"("p_jobname" "text", "p_started" boolean, "p_success" boolean, "p_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "admin"."run_check_alerts"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform admin._job_touch('check_alerts', true, false, null);
  perform public.check_alerts();
  perform admin._job_touch('check_alerts', false, true, null);
exception when others then
  perform admin._job_touch('check_alerts', false, false, SQLERRM);
  raise;
end
$$;


ALTER FUNCTION "admin"."run_check_alerts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "admin"."run_rollup_hourly"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform admin._job_touch('rollup_hourly', true, false, null);
  perform public.rollup_hourly();
  perform admin._job_touch('rollup_hourly', false, true, null);
exception when others then
  perform admin._job_touch('rollup_hourly', false, false, SQLERRM);
  raise;
end
$$;


ALTER FUNCTION "admin"."run_rollup_hourly"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_safe_tz"("p_tz" "text", "p_default" "text" DEFAULT 'UTC'::"text") RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(
    (select name from pg_timezone_names where name = p_tz limit 1),
    p_default
  );
$$;


ALTER FUNCTION "public"."_safe_tz"("p_tz" "text", "p_default" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_version_cmp"("a" "text", "b" "text") RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare ai int[]; bi int[]; i int; la int; lb int;
begin
  ai := coalesce(string_to_array(regexp_replace(a,'[^0-9\.]+','','g'),'.'), array['0'])::int[];
  bi := coalesce(string_to_array(regexp_replace(b,'[^0-9\.]+','','g'),'.'), array['0'])::int[];
  la := coalesce(array_length(ai,1),0);
  lb := coalesce(array_length(bi,1),0);
  if la < lb then ai := ai || array_fill(0, array[lb-la]); end if;
  if lb < la then bi := bi || array_fill(0, array[la-lb]); end if;
  for i in 1..coalesce(array_length(ai,1),0) loop
    if ai[i] > bi[i] then return 1; end if;
    if ai[i] < bi[i] then return -1; end if;
  end loop;
  return 0;
end $$;


ALTER FUNCTION "public"."_version_cmp"("a" "text", "b" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_owner_membership_on_org_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
begin
  insert into public.memberships (user_id, organization_id, role)
  values (auth.uid(), new.id, 'owner')
  on conflict (user_id, organization_id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."add_owner_membership_on_org_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_alerts"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  r record;
  v_breach bool;
  v_rule text;
  v_active_alert_id bigint;
begin
  for r in
    with latest as (
      select distinct on (sr.device_id)
        sr.device_id, sr.ts, sr.temp_c, sr.rh
      from public.sensor_readings sr
      order by sr.device_id, sr.ts desc
    )
    select l.device_id, l.ts, l.temp_c, l.rh,
           d.temp_min, d.temp_max, d.rh_min, d.rh_max
    from latest l
    join public.devices d on d.id = l.device_id
    where l.ts >= now() - interval '15 minutes'
  loop
    v_breach := false;
    v_rule := null;

    if r.temp_min is not null and r.temp_c is not null and r.temp_c < r.temp_min then
      v_breach := true; v_rule := 'temp';
    elsif r.temp_max is not null and r.temp_c is not null and r.temp_c > r.temp_max then
      v_breach := true; v_rule := 'temp';
    end if;

    if not v_breach then
      if r.rh_min is not null and r.rh is not null and r.rh < r.rh_min then
        v_breach := true; v_rule := 'rh';
      elsif r.rh_max is not null and r.rh is not null and r.rh > r.rh_max then
        v_breach := true; v_rule := 'rh';
      end if;
    end if;

    select id into v_active_alert_id
    from public.alerts
    where device_id = r.device_id and active = true
    order by id desc limit 1;

    if v_breach then
      if v_active_alert_id is null then
        insert into public.alerts (device_id, rule, active, breach_value)
        values (r.device_id, v_rule, true,
                case when v_rule='temp' then r.temp_c else r.rh end)
        returning id into v_active_alert_id;

        insert into public.alert_events (alert_id, device_id, event_type, value)
        values (v_active_alert_id, r.device_id, 'breach',
                case when v_rule='temp' then r.temp_c else r.rh end);
      end if;
    else
      if v_active_alert_id is not null then
        update public.alerts
        set active=false, recovered_at=now(),
            recovery_value=coalesce(r.temp_c, r.rh)
        where id = v_active_alert_id;

        insert into public.alert_events (alert_id, device_id, event_type, value)
        values (v_active_alert_id, r.device_id, 'recovery',
                coalesce(r.temp_c, r.rh));
      end if;
    end if;

  end loop;
end;
$$;


ALTER FUNCTION "public"."check_alerts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_device"("p_device" "uuid", "p_code" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_org uuid;
  v_new_key text;
begin
  select organization_id into v_org
  from public.claim_codes
  where code = p_code and expires_at > now();

  if v_org is null then
    raise exception 'invalid or expired claim code';
  end if;

  update public.devices set organization_id = v_org where id = p_device;

  select public.rotate_ingest_key(p_device) into v_new_key;
  return v_new_key;
end;
$$;


ALTER FUNCTION "public"."claim_device"("p_device" "uuid", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_org_has_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
begin
  -- Block DELETE of the last owner
  if tg_op = 'DELETE' and old.role = 'owner' then
    if not exists (
      select 1 from public.memberships
      where organization_id = old.organization_id
        and user_id <> old.user_id
        and role = 'owner'
    ) then
      raise exception 'Cannot remove the last owner from organization %', old.organization_id;
    end if;
    return old;
  end if;

  -- Block UPDATE that demotes the last owner
  if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then
    if not exists (
      select 1 from public.memberships
      where organization_id = old.organization_id
        and user_id <> old.user_id
        and role = 'owner'
    ) then
      raise exception 'Cannot demote the last owner of organization %', old.organization_id;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_org_has_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_device_hourly"("p_device" "uuid", "p_days" integer) RETURNS TABLE("hour_local" timestamp with time zone, "temp_c_avg" double precision, "rh_avg" double precision)
    LANGUAGE "sql" STABLE
    AS $$
  with hours as (
    select
      date_trunc('hour', sr.ts) as hour_utc,
      avg(sr.temp_c)::double precision as temp_c_avg,
      avg(sr.rh)::double precision     as rh_avg
    from public.sensor_readings sr
    where sr.device_id = p_device
      and sr.ts >= now() - make_interval(days => p_days)
    group by 1
  )
  select
    (hours.hour_utc at time zone 'UTC') at time zone 'America/Chicago' as hour_local,
    hours.temp_c_avg,
    hours.rh_avg
  from hours
  order by hour_local asc
$$;


ALTER FUNCTION "public"."export_device_hourly"("p_device" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_device_hourly"("p_device" "uuid", "p_days" integer, "p_tz" "text" DEFAULT 'UTC'::"text") RETURNS TABLE("hour_local" timestamp without time zone, "temp_c_avg" double precision, "rh_avg" double precision)
    LANGUAGE "sql" STABLE
    AS $$
  select
    (h.hour_bucket at time zone public._safe_tz(p_tz, 'UTC')) as hour_local,
    h.avg_temp_c::double precision as temp_c_avg,
    h.avg_rh::double precision     as rh_avg
  from public.sensor_readings_hourly h
  where h.device_id = p_device
    and h.hour_bucket >= date_trunc('hour', now() - make_interval(days => p_days))
  order by h.hour_bucket asc
$$;


ALTER FUNCTION "public"."export_device_hourly"("p_device" "uuid", "p_days" integer, "p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_device_raw"("p_device" "uuid", "p_days" integer) RETURNS TABLE("ts_local" timestamp with time zone, "temp_c" double precision, "rh" double precision)
    LANGUAGE "sql" STABLE
    AS $$
  select
    (sr.ts at time zone 'UTC') at time zone 'America/Chicago' as ts_local,
    sr.temp_c,
    sr.rh
  from public.sensor_readings sr
  where sr.device_id = p_device
    and sr.ts >= now() - make_interval(days => p_days)
  order by sr.ts asc
$$;


ALTER FUNCTION "public"."export_device_raw"("p_device" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_device_raw"("p_device" "uuid", "p_days" integer, "p_tz" "text" DEFAULT 'UTC'::"text") RETURNS TABLE("ts_local" timestamp without time zone, "temp_c" double precision, "rh" double precision)
    LANGUAGE "sql" STABLE
    AS $$
  select
    (sr.ts at time zone public._safe_tz(p_tz, 'UTC')) as ts_local,
    sr.temp_c,
    sr.rh
  from public.sensor_readings sr
  where sr.device_id = p_device
    and sr.ts >= now() - make_interval(days => p_days)
  order by sr.ts asc
$$;


ALTER FUNCTION "public"."export_device_raw"("p_device" "uuid", "p_days" integer, "p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."firmware_check"("p_device" "uuid", "p_current_version" "text", "p_model" "text" DEFAULT NULL::"text", "p_channel" "text" DEFAULT NULL::"text") RETURNS TABLE("device_id" "uuid", "model" "text", "channel" "text", "current_version" "text", "target_version" "text", "url" "text", "checksum_sha256" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  return query
  with d as (
    select dv.id as device_id,
           coalesce(p_model, dv.model)   as model,
           coalesce(p_channel, dv.channel) as channel
    from public.devices as dv
    where dv.id = p_device
  )
  select d.device_id,
         d.model,
         d.channel,
         p_current_version as current_version,
         fb.version        as target_version,
         fb.url,
         fb.checksum_sha256
  from d
  join public.firmware_bundles fb
    on fb.model = d.model and fb.channel = d.channel
  where public._version_cmp(fb.version, p_current_version) = 1
  order by fb.created_at desc, fb.version desc
  limit 1;
end;
$$;


ALTER FUNCTION "public"."firmware_check"("p_device" "uuid", "p_current_version" "text", "p_model" "text", "p_channel" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_health_panel"() RETURNS TABLE("rollup_last_run" timestamp with time zone, "alerts_last_run" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select * from admin.health_panel;
$$;


ALTER FUNCTION "public"."get_health_panel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ingest_readings"("p_device" "uuid", "p_ingest_key" "text", "readings_json" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  rec jsonb;
  v_ok boolean;
begin
  select true into v_ok
  from public.devices d
  where d.id = p_device and d.ingest_key = p_ingest_key;

  if not coalesce(v_ok,false) then
    raise exception 'invalid device or key';
  end if;

  for rec in select * from jsonb_array_elements(readings_json)
  loop
    insert into public.sensor_readings (device_id, ts, temp_c, rh)
    values (
      p_device,
      (rec->>'ts')::timestamptz,
      nullif(rec->>'temp_c','')::numeric,
      nullif(rec->>'rh','')::numeric
    );
  end loop;

  update public.devices
  set last_seen = greatest(coalesce(last_seen, 'epoch'), (
    select max((j->>'ts')::timestamptz) from jsonb_array_elements(readings_json) j
  ))
  where id = p_device;
end;
$$;


ALTER FUNCTION "public"."ingest_readings"("p_device" "uuid", "p_ingest_key" "text", "readings_json" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_admin_or_owner"("p_user" "uuid", "p_org" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (
    select 1
    from public.memberships
    where user_id = p_user
      and organization_id = p_org
      and role in ('owner','admin')
  );
$$;


ALTER FUNCTION "public"."is_org_admin_or_owner"("p_user" "uuid", "p_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member"("p_user" "uuid", "p_org" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (
    select 1
    from public.memberships
    where user_id = p_user
      and organization_id = p_org
  );
$$;


ALTER FUNCTION "public"."is_org_member"("p_user" "uuid", "p_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_role_change_unless_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
begin
  if tg_op = 'UPDATE' and new.role <> old.role then
    if public.is_org_admin_or_owner(auth.uid(), new.organization_id) then
      return new;
    else
      raise exception 'Only owners/admins can change membership roles';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_role_change_unless_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rollup_hourly"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_from timestamptz;
  v_to   timestamptz;
begin
  v_to   := date_trunc('hour', now());
  v_from := v_to - interval '1 hour';

  insert into public.sensor_readings_hourly (device_id, hour_bucket, avg_temp_c, avg_rh)
  select
    r.device_id,
    date_trunc('hour', r.ts) as hour_bucket,
    avg(r.temp_c) as avg_temp_c,
    avg(r.rh)     as avg_rh
  from public.sensor_readings r
  where r.ts >= v_from and r.ts < v_to
  group by r.device_id, date_trunc('hour', r.ts)
  on conflict (device_id, hour_bucket)
  do update set
    avg_temp_c = excluded.avg_temp_c,
    avg_rh     = excluded.avg_rh;
end;
$$;


ALTER FUNCTION "public"."rollup_hourly"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rotate_ingest_key"("p_device" "uuid") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  update public.devices
  set ingest_key = encode(gen_random_bytes(16), 'hex')
  where id = p_device
  returning ingest_key;
$$;


ALTER FUNCTION "public"."rotate_ingest_key"("p_device" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."firmware_bundles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "model" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "version" "text" NOT NULL,
    "url" "text" NOT NULL,
    "checksum_sha256" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "firmware_bundles_channel_check" CHECK (("channel" = ANY (ARRAY['stable'::"text", 'beta'::"text", 'dev'::"text"])))
);


ALTER TABLE "public"."firmware_bundles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "admin"."firmware_latest" AS
 SELECT "model",
    "channel",
    ("array_agg"("version" ORDER BY "created_at" DESC))[1] AS "latest_version",
    ("array_agg"("url" ORDER BY "created_at" DESC))[1] AS "latest_url"
   FROM "public"."firmware_bundles"
  GROUP BY "model", "channel";


ALTER VIEW "admin"."firmware_latest" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "admin"."job_heartbeats" (
    "jobname" "text" NOT NULL,
    "last_started_at" timestamp with time zone,
    "last_succeeded_at" timestamp with time zone,
    "last_failed_at" timestamp with time zone,
    "last_error" "text"
);


ALTER TABLE "admin"."job_heartbeats" OWNER TO "postgres";


CREATE OR REPLACE VIEW "admin"."health_panel" AS
 SELECT ( SELECT "job_heartbeats"."last_succeeded_at"
           FROM "admin"."job_heartbeats"
          WHERE ("job_heartbeats"."jobname" = 'rollup_hourly'::"text")) AS "rollup_last_run",
    ( SELECT "job_heartbeats"."last_succeeded_at"
           FROM "admin"."job_heartbeats"
          WHERE ("job_heartbeats"."jobname" = 'check_alerts'::"text")) AS "alerts_last_run";


ALTER VIEW "admin"."health_panel" OWNER TO "postgres";


CREATE OR REPLACE VIEW "admin"."job_last_success" AS
 SELECT "jobname",
    "last_succeeded_at" AS "last_success_at"
   FROM "admin"."job_heartbeats";


ALTER VIEW "admin"."job_last_success" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alert_events" (
    "id" bigint NOT NULL,
    "alert_id" bigint NOT NULL,
    "device_id" "uuid" NOT NULL,
    "event_type" "public"."alert_event_type" NOT NULL,
    "value" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."alert_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."alert_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."alert_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."alert_events_id_seq" OWNED BY "public"."alert_events"."id";



CREATE TABLE IF NOT EXISTS "public"."alerts" (
    "id" bigint NOT NULL,
    "device_id" "uuid" NOT NULL,
    "rule" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "breach_value" numeric,
    "recovery_value" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recovered_at" timestamp with time zone
);


ALTER TABLE "public"."alerts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."alerts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."alerts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."alerts_id_seq" OWNED BY "public"."alerts"."id";



CREATE TABLE IF NOT EXISTS "public"."claim_codes" (
    "code" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."claim_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "ingest_key" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(16), 'hex'::"text") NOT NULL,
    "last_seen" timestamp with time zone,
    "status" "text",
    "temp_min" numeric,
    "temp_max" numeric,
    "rh_min" numeric,
    "rh_max" numeric,
    "firmware_version" "text" DEFAULT '0.0.0'::"text",
    "model" "text",
    "channel" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "report_interval_min" integer DEFAULT 15 NOT NULL,
    "sample_interval_min" integer DEFAULT 15,
    CONSTRAINT "devices_report_interval_min_check" CHECK (((("report_interval_min" % 5) = 0) AND ("report_interval_min" >= 5) AND ("report_interval_min" <= 120)))
);


ALTER TABLE "public"."devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memberships_role_allowed_values" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."my_orgs" AS
 SELECT "o"."id",
    "o"."name",
    "o"."created_at"
   FROM ("public"."organizations" "o"
     JOIN "public"."memberships" "m" ON (("m"."organization_id" = "o"."id")))
  WHERE ("m"."user_id" = "auth"."uid"());


ALTER VIEW "public"."my_orgs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sensor_readings" (
    "id" bigint NOT NULL,
    "device_id" "uuid" NOT NULL,
    "ts" timestamp with time zone NOT NULL,
    "temp_c" numeric,
    "rh" numeric
);


ALTER TABLE "public"."sensor_readings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sensor_readings_hourly" (
    "device_id" "uuid" NOT NULL,
    "hour_bucket" timestamp with time zone NOT NULL,
    "avg_temp_c" numeric,
    "avg_rh" numeric
);


ALTER TABLE "public"."sensor_readings_hourly" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."sensor_readings_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sensor_readings_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."sensor_readings_id_seq" OWNED BY "public"."sensor_readings"."id";



ALTER TABLE ONLY "public"."alert_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."alert_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."alerts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."alerts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."sensor_readings" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."sensor_readings_id_seq"'::"regclass");



ALTER TABLE ONLY "admin"."job_heartbeats"
    ADD CONSTRAINT "job_heartbeats_pkey" PRIMARY KEY ("jobname");



ALTER TABLE ONLY "public"."alert_events"
    ADD CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."claim_codes"
    ADD CONSTRAINT "claim_codes_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."firmware_bundles"
    ADD CONSTRAINT "firmware_bundles_model_channel_version_key" UNIQUE ("model", "channel", "version");



ALTER TABLE ONLY "public"."firmware_bundles"
    ADD CONSTRAINT "firmware_bundles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("user_id", "organization_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sensor_readings_hourly"
    ADD CONSTRAINT "sensor_readings_hourly_pkey" PRIMARY KEY ("device_id", "hour_bucket");



ALTER TABLE ONLY "public"."sensor_readings"
    ADD CONSTRAINT "sensor_readings_pkey" PRIMARY KEY ("id");



CREATE INDEX "devices_org_idx" ON "public"."devices" USING "btree" ("organization_id");



CREATE INDEX "idx_alert_events_device_time" ON "public"."alert_events" USING "btree" ("device_id", "created_at" DESC);



CREATE INDEX "idx_alerts_device_active" ON "public"."alerts" USING "btree" ("device_id", "active");



CREATE INDEX "idx_devices_org_name" ON "public"."devices" USING "btree" ("organization_id", "name");



CREATE INDEX "idx_sr_device_ts" ON "public"."sensor_readings" USING "btree" ("device_id", "ts" DESC);



CREATE INDEX "idx_sr_hourly_device_hour_desc" ON "public"."sensor_readings_hourly" USING "btree" ("device_id", "hour_bucket" DESC);



CREATE INDEX "memberships_org_idx" ON "public"."memberships" USING "btree" ("organization_id");



CREATE INDEX "memberships_org_role_idx" ON "public"."memberships" USING "btree" ("organization_id", "role");



CREATE INDEX "memberships_user_idx" ON "public"."memberships" USING "btree" ("user_id");



CREATE INDEX "sensor_readings_device_ts_idx" ON "public"."sensor_readings" USING "btree" ("device_id", "ts" DESC);



CREATE OR REPLACE TRIGGER "trg_add_owner_on_org_insert" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."add_owner_membership_on_org_insert"();



CREATE OR REPLACE TRIGGER "trg_ensure_org_has_owner" BEFORE DELETE OR UPDATE ON "public"."memberships" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_org_has_owner"();



CREATE OR REPLACE TRIGGER "trg_prevent_role_change_unless_admin" BEFORE UPDATE ON "public"."memberships" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_role_change_unless_admin"();



ALTER TABLE ONLY "public"."alert_events"
    ADD CONSTRAINT "alert_events_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alert_events"
    ADD CONSTRAINT "alert_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alerts"
    ADD CONSTRAINT "alerts_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."claim_codes"
    ADD CONSTRAINT "claim_codes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_org_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sensor_readings"
    ADD CONSTRAINT "sensor_readings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sensor_readings_hourly"
    ADD CONSTRAINT "sensor_readings_hourly_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE CASCADE;



ALTER TABLE "public"."alert_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "alert_events_select" ON "public"."alert_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."devices" "d"
     JOIN "public"."memberships" "m" ON (("m"."organization_id" = "d"."organization_id")))
  WHERE (("d"."id" = "alert_events"."device_id") AND ("m"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "alerts_select" ON "public"."alerts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."devices" "d"
     JOIN "public"."memberships" "m" ON (("m"."organization_id" = "d"."organization_id")))
  WHERE (("d"."id" = "alerts"."device_id") AND ("m"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."devices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "devices_modify" ON "public"."devices" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."organization_id" = "devices"."organization_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = 'owner'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."organization_id" = "devices"."organization_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = 'owner'::"text")))));



CREATE POLICY "devices_select" ON "public"."devices" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."organization_id" = "devices"."organization_id") AND ("m"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."firmware_bundles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "firmware_bundles_select" ON "public"."firmware_bundles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "memberships_delete_owner_admin_only" ON "public"."memberships" FOR DELETE USING ("public"."is_org_admin_or_owner"("auth"."uid"(), "organization_id"));



CREATE POLICY "memberships_insert_owner_admin_only" ON "public"."memberships" FOR INSERT WITH CHECK ("public"."is_org_admin_or_owner"("auth"."uid"(), "organization_id"));



CREATE POLICY "memberships_select_if_in_same_org" ON "public"."memberships" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



CREATE POLICY "memberships_update_self_or_owner_admin" ON "public"."memberships" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR "public"."is_org_admin_or_owner"("auth"."uid"(), "organization_id"))) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."is_org_admin_or_owner"("auth"."uid"(), "organization_id")));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orgs_insert_authenticated" ON "public"."organizations" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "orgs_select_if_member" ON "public"."organizations" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "id"));



CREATE POLICY "orgs_update_if_member" ON "public"."organizations" FOR UPDATE USING ("public"."is_org_member"("auth"."uid"(), "id")) WITH CHECK ("public"."is_org_member"("auth"."uid"(), "id"));



ALTER TABLE "public"."sensor_readings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sensor_readings_hourly" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sr_select" ON "public"."sensor_readings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."devices" "d"
     JOIN "public"."memberships" "m" ON (("m"."organization_id" = "d"."organization_id")))
  WHERE (("d"."id" = "sensor_readings"."device_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "srh_select" ON "public"."sensor_readings_hourly" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."devices" "d"
     JOIN "public"."memberships" "m" ON (("m"."organization_id" = "d"."organization_id")))
  WHERE (("d"."id" = "sensor_readings_hourly"."device_id") AND ("m"."user_id" = "auth"."uid"())))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "admin" TO "authenticated";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "admin"."run_check_alerts"() TO "authenticated";



GRANT ALL ON FUNCTION "admin"."run_rollup_hourly"() TO "authenticated";

























































































































































































































































GRANT ALL ON FUNCTION "public"."_safe_tz"("p_tz" "text", "p_default" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_safe_tz"("p_tz" "text", "p_default" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_safe_tz"("p_tz" "text", "p_default" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_version_cmp"("a" "text", "b" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_version_cmp"("a" "text", "b" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_version_cmp"("a" "text", "b" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_owner_membership_on_org_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."add_owner_membership_on_org_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_owner_membership_on_org_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_alerts"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_alerts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_alerts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_device"("p_device" "uuid", "p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_device"("p_device" "uuid", "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_device"("p_device" "uuid", "p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_org_has_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_org_has_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_org_has_owner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."export_device_hourly"("p_device" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."export_device_hourly"("p_device" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_device_hourly"("p_device" "uuid", "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."export_device_hourly"("p_device" "uuid", "p_days" integer, "p_tz" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."export_device_hourly"("p_device" "uuid", "p_days" integer, "p_tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_device_hourly"("p_device" "uuid", "p_days" integer, "p_tz" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."export_device_raw"("p_device" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."export_device_raw"("p_device" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_device_raw"("p_device" "uuid", "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."export_device_raw"("p_device" "uuid", "p_days" integer, "p_tz" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."export_device_raw"("p_device" "uuid", "p_days" integer, "p_tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_device_raw"("p_device" "uuid", "p_days" integer, "p_tz" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."firmware_check"("p_device" "uuid", "p_current_version" "text", "p_model" "text", "p_channel" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."firmware_check"("p_device" "uuid", "p_current_version" "text", "p_model" "text", "p_channel" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."firmware_check"("p_device" "uuid", "p_current_version" "text", "p_model" "text", "p_channel" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."firmware_check"("p_device" "uuid", "p_current_version" "text", "p_model" "text", "p_channel" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_health_panel"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_health_panel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_health_panel"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ingest_readings"("p_device" "uuid", "p_ingest_key" "text", "readings_json" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."ingest_readings"("p_device" "uuid", "p_ingest_key" "text", "readings_json" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ingest_readings"("p_device" "uuid", "p_ingest_key" "text", "readings_json" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_admin_or_owner"("p_user" "uuid", "p_org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_admin_or_owner"("p_user" "uuid", "p_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin_or_owner"("p_user" "uuid", "p_org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_member"("p_user" "uuid", "p_org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_user" "uuid", "p_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_user" "uuid", "p_org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_role_change_unless_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_role_change_unless_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_role_change_unless_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rollup_hourly"() TO "anon";
GRANT ALL ON FUNCTION "public"."rollup_hourly"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rollup_hourly"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rotate_ingest_key"("p_device" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rotate_ingest_key"("p_device" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rotate_ingest_key"("p_device" "uuid") TO "service_role";












GRANT ALL ON TABLE "public"."firmware_bundles" TO "anon";
GRANT ALL ON TABLE "public"."firmware_bundles" TO "authenticated";
GRANT ALL ON TABLE "public"."firmware_bundles" TO "service_role";



GRANT SELECT ON TABLE "admin"."firmware_latest" TO "authenticated";



GRANT SELECT ON TABLE "admin"."job_heartbeats" TO "authenticated";



GRANT SELECT ON TABLE "admin"."health_panel" TO "authenticated";



GRANT SELECT ON TABLE "admin"."job_last_success" TO "authenticated";















GRANT ALL ON TABLE "public"."alert_events" TO "anon";
GRANT ALL ON TABLE "public"."alert_events" TO "authenticated";
GRANT ALL ON TABLE "public"."alert_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."alert_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."alert_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."alert_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."alerts" TO "anon";
GRANT ALL ON TABLE "public"."alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."alerts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."alerts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."alerts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."alerts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."claim_codes" TO "anon";
GRANT ALL ON TABLE "public"."claim_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."claim_codes" TO "service_role";



GRANT ALL ON TABLE "public"."devices" TO "anon";
GRANT ALL ON TABLE "public"."devices" TO "authenticated";
GRANT ALL ON TABLE "public"."devices" TO "service_role";



GRANT ALL ON TABLE "public"."memberships" TO "anon";
GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."my_orgs" TO "anon";
GRANT ALL ON TABLE "public"."my_orgs" TO "authenticated";
GRANT ALL ON TABLE "public"."my_orgs" TO "service_role";



GRANT ALL ON TABLE "public"."sensor_readings" TO "anon";
GRANT ALL ON TABLE "public"."sensor_readings" TO "authenticated";
GRANT ALL ON TABLE "public"."sensor_readings" TO "service_role";



GRANT ALL ON TABLE "public"."sensor_readings_hourly" TO "anon";
GRANT ALL ON TABLE "public"."sensor_readings_hourly" TO "authenticated";
GRANT ALL ON TABLE "public"."sensor_readings_hourly" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sensor_readings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sensor_readings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sensor_readings_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























RESET ALL;
