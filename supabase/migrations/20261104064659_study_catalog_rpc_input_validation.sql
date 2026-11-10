SET local check_function_bodies = off;

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
  -- 허용한 키·타입만 받는다(Route Handler 를 거치지 않은 직접 호출도 같은 계약)
  if exists (
       select 1 from jsonb_object_keys(p_study) k
       where k not in ('studyInstanceUid', 'studyDate', 'studyDescription', 'studyId', 'accessionNumber', 'series'))
     or jsonb_typeof(p_study -> 'studyInstanceUid') is distinct from 'string'
     or exists (
       select 1 from unnest(array['studyDate', 'studyDescription', 'studyId', 'accessionNumber']) f
       where p_study ? f and jsonb_typeof(p_study -> f) <> 'string') then
    raise exception 'invalid-payload' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_study -> 'series') s
    where case
      when jsonb_typeof(s) <> 'object' then true
      else exists (
             select 1 from jsonb_object_keys(s) k
             where k not in ('seriesInstanceUid', 'modality', 'seriesNumber', 'seriesDescription', 'instances'))
        or jsonb_typeof(s -> 'seriesInstanceUid') is distinct from 'string'
        or (s ? 'modality' and jsonb_typeof(s -> 'modality') <> 'string')
        or (s ? 'seriesDescription' and jsonb_typeof(s -> 'seriesDescription') <> 'string')
        or (s ? 'seriesNumber' and (jsonb_typeof(s -> 'seriesNumber') <> 'number'
                                    or (s ->> 'seriesNumber') !~ '^-?[0-9]{1,10}$'))
        or jsonb_typeof(s -> 'instances') is distinct from 'array'
    end
  ) then
    raise exception 'invalid-payload' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_study -> 'series') s
    cross join lateral jsonb_array_elements(s -> 'instances') i
    where case
      when jsonb_typeof(i) <> 'object' then true
      else exists (
             select 1 from jsonb_object_keys(i) k
             where k not in ('sopInstanceUid', 'contentDigest'))
        or jsonb_typeof(i -> 'sopInstanceUid') is distinct from 'string'
        or jsonb_typeof(i -> 'contentDigest') is distinct from 'string'
    end
  ) then
    raise exception 'invalid-payload' using errcode = '22023';
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
