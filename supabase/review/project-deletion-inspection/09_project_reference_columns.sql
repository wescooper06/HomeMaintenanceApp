BEGIN TRANSACTION READ ONLY;

SELECT n.nspname AS schema_name, c.relname AS relation_name, c.relkind,
       a.attname AS candidate_column, format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull AS not_null,
       CASE WHEN a.atttypid = 'uuid'::regtype THEN 'UUID storage; ownership unproven'
            WHEN a.atttypid IN ('json'::regtype, 'jsonb'::regtype)
              THEN 'Structured data; inspect explicit identity paths before assigning ownership'
            WHEN a.attname ~* '(project|parent|master|converted|source.?task|external.?id)'
              THEN 'Identity-like name; semantics unproven'
            ELSE 'Scalar alias storage candidate; semantics unproven' END AS discovery_reason,
       CASE
         WHEN c.relname = 'planner_tasks' AND a.attname = 'metadata_json'
           THEN 'Code: series recurrence configuration, queue and queueOrder'
         WHEN c.relname = 'planner_weekly_tasks' AND a.attname = 'metadata_json'
           THEN 'Code: sourceTaskId, overrides and occurrence metadata'
         WHEN c.relname = 'planner_weekly_tasks' AND a.attname = 'reminder_json'
           THEN 'Code: active/provider/eventId/sendAt; remote event may survive local row removal'
         WHEN c.relname = 'planner_parking_lot' AND a.attname = 'metadata_json'
           THEN 'Code: conversionType disambiguates converted_to_id'
         WHEN a.attname IN ('checklist_json', 'reminder_json', 'checklistJson', 'reminderJson')
           THEN 'Embedded checklist/reminder state; ownership follows characterized owning row'
         WHEN c.relname IN ('curated_queue', 'staged_queue') AND a.attname = 'item'
           THEN 'Historical migration JSON queue snapshot; live use unverified'
         WHEN c.relname = 'planner_profiles' AND a.attname = 'legacyImport'
           THEN 'Global import snapshot; not automatically project-owned'
       END AS application_context
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
JOIN pg_type typ ON typ.oid = a.atttypid
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND (a.atttypid IN ('uuid'::regtype, 'json'::regtype, 'jsonb'::regtype)
       OR typ.typcategory IN ('S', 'N', 'A')
       OR a.attname ~* '(project|parent|master|converted|source.?task|external.?id)')
ORDER BY c.relname, a.attnum;

COMMIT;
