SET local check_function_bodies = off;

CREATE TABLE "public"."catalog_instances" (
  "study_instance_uid"  text                     NOT NULL,
  "series_instance_uid" text                     NOT NULL,
  "sop_instance_uid"    text                     NOT NULL,
  "content_digest"      text                     NOT NULL,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "catalog_instances_digest_check" CHECK ((content_digest ~ '^[0-9a-f]{64}$'::text)),
  CONSTRAINT "catalog_instances_uid_check" CHECK (((char_length(sop_instance_uid) <= 64) AND (sop_instance_uid ~ '^[0-9]+(\.[0-9]+)*$'::text))),
  "owner_id"            uuid                     NOT NULL DEFAULT auth.uid(),
  CONSTRAINT "catalog_instances_pkey" PRIMARY KEY (owner_id, sop_instance_uid)
);

ALTER TABLE "public"."catalog_instances"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."catalog_instances" FROM "anon";

CREATE TABLE "public"."catalog_series" (
  "study_instance_uid"  text                     NOT NULL,
  "series_instance_uid" text                     NOT NULL,
  "modality"            text,
  "series_number"       integer,
  "series_description"  text,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "catalog_series_description_check"
    CHECK ((((char_length(series_description) >= 1) AND (char_length(series_description) <= 256)) AND (series_description !~ '[[:cntrl:]]'::text))),
  CONSTRAINT "catalog_series_modality_check" CHECK ((((char_length(modality) >= 1) AND (char_length(modality) <= 16)) AND (modality ~ '^[A-Z0-9_]+$'::text))),
  CONSTRAINT "catalog_series_uid_check" CHECK (((char_length(series_instance_uid) <= 64) AND (series_instance_uid ~ '^[0-9]+(\.[0-9]+)*$'::text))),
  "owner_id"            uuid                     NOT NULL DEFAULT auth.uid(),
  CONSTRAINT "catalog_series_hierarchy_key" UNIQUE (owner_id, study_instance_uid, series_instance_uid),
  CONSTRAINT "catalog_series_pkey" PRIMARY KEY (owner_id, series_instance_uid)
);

ALTER TABLE "public"."catalog_series"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."catalog_series" FROM "anon";

CREATE TABLE "public"."catalog_studies" (
  "study_instance_uid" text                     NOT NULL,
  "study_date"         text,
  "study_description"  text,
  "study_id"           text,
  "accession_number"   text,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "catalog_studies_accession_check"
    CHECK ((((char_length(accession_number) >= 1) AND (char_length(accession_number) <= 64)) AND (accession_number !~ '[[:cntrl:]]'::text))),
  CONSTRAINT "catalog_studies_date_check" CHECK ((study_date ~ '^[0-9]{8}$'::text)),
  CONSTRAINT "catalog_studies_description_check"
    CHECK ((((char_length(study_description) >= 1) AND (char_length(study_description) <= 256)) AND (study_description !~ '[[:cntrl:]]'::text))),
  CONSTRAINT "catalog_studies_study_id_check" CHECK ((((char_length(study_id) >= 1) AND (char_length(study_id) <= 64)) AND (study_id !~ '[[:cntrl:]]'::text))),
  CONSTRAINT "catalog_studies_uid_check" CHECK (((char_length(study_instance_uid) <= 64) AND (study_instance_uid ~ '^[0-9]+(\.[0-9]+)*$'::text))),
  "owner_id"           uuid                     NOT NULL DEFAULT auth.uid(),
  CONSTRAINT "catalog_studies_pkey" PRIMARY KEY (owner_id, study_instance_uid)
);

ALTER TABLE "public"."catalog_studies"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."catalog_studies" FROM "anon";

CREATE OR REPLACE FUNCTION public.sync_catalog_study (
  p_expected_owner uuid,
  p_study          jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_owner uuid := (select auth.uid());
  v_study text;
  v_series_count integer;
  v_instance_count integer;
begin
  if v_owner is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  -- 요청을 만든 화면의 계정과 현재 인증 계정이 다르면(계정 변경 뒤 도착한 요청) 거부한다
  if p_expected_owner is distinct from v_owner then
    raise exception 'account-mismatch' using errcode = '42501';
  end if;
  if jsonb_typeof(p_study) is distinct from 'object'
     or jsonb_typeof(p_study -> 'series') is distinct from 'array' then
    raise exception 'invalid-payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p_study -> 'series') not between 1 and 200 then
    raise exception 'payload-too-large' using errcode = '22023';
  end if;
  if (select coalesce(sum(jsonb_array_length(s -> 'instances')), 0)
        from jsonb_array_elements(p_study -> 'series') s) not between 1 and 1000 then
    raise exception 'payload-too-large' using errcode = '22023';
  end if;

  v_study := p_study ->> 'studyInstanceUid';

  insert into public.catalog_studies
    (owner_id, study_instance_uid, study_date, study_description, study_id, accession_number)
  values (v_owner, v_study, p_study ->> 'studyDate', p_study ->> 'studyDescription',
          p_study ->> 'studyId', p_study ->> 'accessionNumber')
  on conflict (owner_id, study_instance_uid) do nothing;

  insert into public.catalog_series
    (owner_id, study_instance_uid, series_instance_uid, modality, series_number, series_description)
  select v_owner, v_study, p."seriesInstanceUid", p.modality, p."seriesNumber", p."seriesDescription"
  from jsonb_to_recordset(p_study -> 'series')
    as p("seriesInstanceUid" text, modality text, "seriesNumber" integer, "seriesDescription" text)
  order by p."seriesInstanceUid"
  on conflict (owner_id, series_instance_uid) do nothing;

  -- 이미 다른 검사에 속한 시리즈는 옮기지 않고 실패로 알린다(트랜잭션 전체 취소)
  if exists (
    select 1 from jsonb_to_recordset(p_study -> 'series') as p("seriesInstanceUid" text)
    join public.catalog_series c
      on c.owner_id = v_owner and c.series_instance_uid = p."seriesInstanceUid"
    where c.study_instance_uid <> v_study
  ) then
    raise exception 'series-conflict' using errcode = 'P0001';
  end if;

  insert into public.catalog_instances
    (owner_id, study_instance_uid, series_instance_uid, sop_instance_uid, content_digest)
  select v_owner, v_study, s."seriesInstanceUid", i."sopInstanceUid", i."contentDigest"
  from jsonb_to_recordset(p_study -> 'series') as s("seriesInstanceUid" text, instances jsonb)
  cross join lateral jsonb_to_recordset(s.instances) as i("sopInstanceUid" text, "contentDigest" text)
  order by i."sopInstanceUid"
  on conflict (owner_id, sop_instance_uid) do nothing;

  -- 같은 SOP UID 의 내용(digest)·계층이 다르면 기존 자료를 보존하고 실패로 알린다
  if exists (
    select 1 from jsonb_to_recordset(p_study -> 'series') as s("seriesInstanceUid" text, instances jsonb)
  cross join lateral jsonb_to_recordset(s.instances) as i("sopInstanceUid" text, "contentDigest" text)
    join public.catalog_instances c
      on c.owner_id = v_owner and c.sop_instance_uid = i."sopInstanceUid"
    where c.content_digest <> i."contentDigest"
       or c.series_instance_uid <> s."seriesInstanceUid"
       or c.study_instance_uid <> v_study
  ) then
    raise exception 'instance-conflict' using errcode = 'P0001';
  end if;

  select count(*) into v_series_count from public.catalog_series
    where owner_id = v_owner and study_instance_uid = v_study;
  select count(*) into v_instance_count from public.catalog_instances
    where owner_id = v_owner and study_instance_uid = v_study;
  return jsonb_build_object('studyInstanceUid', v_study,
    'seriesCount', v_series_count, 'instanceCount', v_instance_count);
end
$function$;

REVOKE ALL ON FUNCTION "public"."sync_catalog_study"(uuid, jsonb) FROM PUBLIC, "anon", "service_role";

GRANT EXECUTE ON FUNCTION "public"."sync_catalog_study"(uuid, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."sync_catalog_study"(uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_catalog_study"(uuid, jsonb) TO "postgres";

REVOKE ALL ON TABLE "public"."catalog_instances" FROM "authenticated";

REVOKE ALL ("content_digest") ON TABLE "public"."catalog_instances" FROM "authenticated";

GRANT INSERT ("content_digest") ON TABLE "public"."catalog_instances" TO "authenticated";

REVOKE ALL ("series_instance_uid") ON TABLE "public"."catalog_instances" FROM "authenticated";

GRANT INSERT ("series_instance_uid") ON TABLE "public"."catalog_instances" TO "authenticated";

REVOKE ALL ("sop_instance_uid") ON TABLE "public"."catalog_instances" FROM "authenticated";

GRANT INSERT ("sop_instance_uid") ON TABLE "public"."catalog_instances" TO "authenticated";

REVOKE ALL ("study_instance_uid") ON TABLE "public"."catalog_instances" FROM "authenticated";

GRANT INSERT ("study_instance_uid") ON TABLE "public"."catalog_instances" TO "authenticated";

GRANT SELECT ON TABLE "public"."catalog_instances" TO "authenticated";

REVOKE ALL ON TABLE "public"."catalog_instances" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."catalog_instances" TO "postgres";

REVOKE ALL ON TABLE "public"."catalog_instances" FROM "service_role";

GRANT DELETE, SELECT ON TABLE "public"."catalog_instances" TO "service_role";

REVOKE ALL ON TABLE "public"."catalog_series" FROM "authenticated";

REVOKE ALL ("modality") ON TABLE "public"."catalog_series" FROM "authenticated";

GRANT INSERT ("modality") ON TABLE "public"."catalog_series" TO "authenticated";

REVOKE ALL ("series_description") ON TABLE "public"."catalog_series" FROM "authenticated";

GRANT INSERT ("series_description") ON TABLE "public"."catalog_series" TO "authenticated";

REVOKE ALL ("series_instance_uid") ON TABLE "public"."catalog_series" FROM "authenticated";

GRANT INSERT ("series_instance_uid") ON TABLE "public"."catalog_series" TO "authenticated";

REVOKE ALL ("series_number") ON TABLE "public"."catalog_series" FROM "authenticated";

GRANT INSERT ("series_number") ON TABLE "public"."catalog_series" TO "authenticated";

REVOKE ALL ("study_instance_uid") ON TABLE "public"."catalog_series" FROM "authenticated";

GRANT INSERT ("study_instance_uid") ON TABLE "public"."catalog_series" TO "authenticated";

GRANT SELECT ON TABLE "public"."catalog_series" TO "authenticated";

REVOKE ALL ON TABLE "public"."catalog_series" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."catalog_series" TO "postgres";

REVOKE ALL ON TABLE "public"."catalog_series" FROM "service_role";

GRANT DELETE, SELECT ON TABLE "public"."catalog_series" TO "service_role";

REVOKE ALL ON TABLE "public"."catalog_studies" FROM "authenticated";

REVOKE ALL ("accession_number") ON TABLE "public"."catalog_studies" FROM "authenticated";

GRANT INSERT ("accession_number") ON TABLE "public"."catalog_studies" TO "authenticated";

REVOKE ALL ("study_date") ON TABLE "public"."catalog_studies" FROM "authenticated";

GRANT INSERT ("study_date") ON TABLE "public"."catalog_studies" TO "authenticated";

REVOKE ALL ("study_description") ON TABLE "public"."catalog_studies" FROM "authenticated";

GRANT INSERT ("study_description") ON TABLE "public"."catalog_studies" TO "authenticated";

REVOKE ALL ("study_id") ON TABLE "public"."catalog_studies" FROM "authenticated";

GRANT INSERT ("study_id") ON TABLE "public"."catalog_studies" TO "authenticated";

REVOKE ALL ("study_instance_uid") ON TABLE "public"."catalog_studies" FROM "authenticated";

GRANT INSERT ("study_instance_uid") ON TABLE "public"."catalog_studies" TO "authenticated";

GRANT SELECT ON TABLE "public"."catalog_studies" TO "authenticated";

REVOKE ALL ON TABLE "public"."catalog_studies" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."catalog_studies" TO "postgres";

REVOKE ALL ON TABLE "public"."catalog_studies" FROM "service_role";

GRANT DELETE, SELECT ON TABLE "public"."catalog_studies" TO "service_role";

CREATE INDEX catalog_instances_series_idx ON public.catalog_instances USING btree (owner_id, study_instance_uid, series_instance_uid);

CREATE POLICY "catalog_instances_insert_own" ON "public"."catalog_instances"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));

CREATE POLICY "catalog_instances_select_own" ON "public"."catalog_instances"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = owner_id));

REVOKE ALL ("owner_id") ON TABLE "public"."catalog_instances" FROM "authenticated";

GRANT INSERT ("owner_id") ON TABLE "public"."catalog_instances" TO "authenticated";

ALTER TABLE "public"."catalog_instances"
  ADD CONSTRAINT "catalog_instances_series_fkey" FOREIGN KEY (owner_id, study_instance_uid, series_instance_uid)
    REFERENCES public.catalog_series(owner_id, study_instance_uid, series_instance_uid) ON DELETE CASCADE;

CREATE POLICY "catalog_series_insert_own" ON "public"."catalog_series"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));

CREATE POLICY "catalog_series_select_own" ON "public"."catalog_series"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = owner_id));

REVOKE ALL ("owner_id") ON TABLE "public"."catalog_series" FROM "authenticated";

GRANT INSERT ("owner_id") ON TABLE "public"."catalog_series" TO "authenticated";

ALTER TABLE "public"."catalog_studies"
  ADD CONSTRAINT "catalog_studies_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."catalog_series"
  ADD CONSTRAINT "catalog_series_study_fkey" FOREIGN KEY (owner_id, study_instance_uid) REFERENCES public.catalog_studies(owner_id, study_instance_uid) ON DELETE CASCADE;

CREATE VIEW "public"."catalog_study_summaries" WITH (security_invoker=true) AS  SELECT st.owner_id,
    st.study_instance_uid,
    st.study_date,
    st.study_description,
    st.study_id,
    st.accession_number,
    st.created_at,
    (COALESCE(se.series_count, (0)::bigint))::integer AS series_count,
    COALESCE(se.modalities, '{}'::text[]) AS modalities,
    (COALESCE(im.instance_count, (0)::bigint))::integer AS instance_count
   FROM ((public.catalog_studies st
     LEFT JOIN LATERAL ( SELECT count(*) AS series_count,
            array_agg(DISTINCT s.modality ORDER BY s.modality) FILTER (WHERE (s.modality IS NOT NULL)) AS modalities
           FROM public.catalog_series s
          WHERE ((s.owner_id = st.owner_id) AND (s.study_instance_uid = st.study_instance_uid))) se ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS instance_count
           FROM public.catalog_instances i
          WHERE ((i.owner_id = st.owner_id) AND (i.study_instance_uid = st.study_instance_uid))) im ON (true));

REVOKE ALL ON TABLE "public"."catalog_study_summaries" FROM "anon", "service_role";

CREATE POLICY "catalog_studies_insert_own" ON "public"."catalog_studies"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));

CREATE POLICY "catalog_studies_select_own" ON "public"."catalog_studies"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = owner_id));

REVOKE ALL ("owner_id") ON TABLE "public"."catalog_studies" FROM "authenticated";

GRANT INSERT ("owner_id") ON TABLE "public"."catalog_studies" TO "authenticated";

REVOKE ALL ON TABLE "public"."catalog_study_summaries" FROM "authenticated";

GRANT SELECT ON TABLE "public"."catalog_study_summaries" TO "authenticated";

REVOKE ALL ON TABLE "public"."catalog_study_summaries" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."catalog_study_summaries" TO "postgres";
