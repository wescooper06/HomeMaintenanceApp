schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
public,curated_queue,planner_shared_curated,PERMISSIVE,"{anon,authenticated}",ALL,"(""profileId"" = 'default'::text)","(""profileId"" = 'default'::text)"
public,parking_lot,planner_shared_parking,PERMISSIVE,"{anon,authenticated}",ALL,"(""profileId"" = 'default'::text)","(""profileId"" = 'default'::text)"
public,planner_profiles,planner_shared_profile,PERMISSIVE,"{anon,authenticated}",ALL,(id = 'default'::text),(id = 'default'::text)
public,staged_queue,planner_shared_staged,PERMISSIVE,"{anon,authenticated}",ALL,"(""profileId"" = 'default'::text)","(""profileId"" = 'default'::text)"