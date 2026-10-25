schema_name,relation_name,relkind,candidate_column,data_type,not_null,discovery_reason,application_context
public,activity_rules,r,days,text,true,Scalar alias storage candidate; semantics unproven,null
public,activity_rules,r,activity_type_id,text,false,Scalar alias storage candidate; semantics unproven,null
public,activity_rules,r,recurrence,text,false,Scalar alias storage candidate; semantics unproven,null
public,activity_rules,r,priority,smallint,false,Scalar alias storage candidate; semantics unproven,null
public,activity_rules,r,notes,text,false,Scalar alias storage candidate; semantics unproven,null
public,activity_rules,r,id,uuid,true,UUID storage; ownership unproven,null
public,activity_types,r,id,text,true,Scalar alias storage candidate; semantics unproven,null
public,activity_types,r,name,text,true,Scalar alias storage candidate; semantics unproven,null
public,activity_types,r,color,text,false,Scalar alias storage candidate; semantics unproven,null
public,activity_types,r,category,text,false,Scalar alias storage candidate; semantics unproven,null
public,activity_types,r,notes,text,false,Scalar alias storage candidate; semantics unproven,null
public,activity_weekly_grid,r,day,text,true,Scalar alias storage candidate; semantics unproven,null
public,activity_weekly_grid,r,activity_type_id,text,false,Scalar alias storage candidate; semantics unproven,null
public,activity_weekly_grid,r,rule_id,uuid,false,UUID storage; ownership unproven,null
public,curated_queue,r,profileId,text,true,Scalar alias storage candidate; semantics unproven,null
public,curated_queue,r,taskId,text,true,Scalar alias storage candidate; semantics unproven,null
public,curated_queue,r,position,bigint,true,Scalar alias storage candidate; semantics unproven,null
public,curated_queue,r,item,jsonb,true,Structured data; inspect explicit identity paths before assigning ownership,Historical migration JSON queue snapshot; live use unverified
public,parking_lot,r,profileId,text,true,Scalar alias storage candidate; semantics unproven,null
public,parking_lot,r,id,text,true,Scalar alias storage candidate; semantics unproven,null
public,parking_lot,r,position,bigint,true,Scalar alias storage candidate; semantics unproven,null
public,parking_lot,r,title,text,true,Scalar alias storage candidate; semantics unproven,null
public,parking_lot,r,notes,text,true,Scalar alias storage candidate; semantics unproven,null
public,parking_lot,r,createdAt,text,true,Scalar alias storage candidate; semantics unproven,null
public,parking_lot,r,updatedAt,text,true,Scalar alias storage candidate; semantics unproven,null
public,parking_lot,r,source,text,true,Scalar alias storage candidate; semantics unproven,null
public,parking_lot,r,tags,text,true,Scalar alias storage candidate; semantics unproven,null
public,parking_lot,r,priority,text,true,Scalar alias storage candidate; semantics unproven,null
public,parking_lot,r,convertedTo,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,null
public,parking_lot,r,color,text,true,Scalar alias storage candidate; semantics unproven,null
public,parking_lot,r,checklistJson,jsonb,true,Structured data; inspect explicit identity paths before assigning ownership,Embedded checklist/reminder state; ownership follows characterized owning row
public,parking_lot,r,reminderJson,jsonb,true,Structured data; inspect explicit identity paths before assigning ownership,Embedded checklist/reminder state; ownership follows characterized owning row
public,parking_lot,r,metadataJson,jsonb,true,Structured data; inspect explicit identity paths before assigning ownership,null
public,parking_lot,r,convertedFromParking,text,true,Identity-like name; semantics unproven,null
public,planner_parking_lot,r,id,text,true,Scalar alias storage candidate; semantics unproven,null
public,planner_parking_lot,r,title,text,false,Scalar alias storage candidate; semantics unproven,null
public,planner_parking_lot,r,notes,text,false,Scalar alias storage candidate; semantics unproven,null
public,planner_parking_lot,r,tags,text,false,Scalar alias storage candidate; semantics unproven,null
public,planner_parking_lot,r,priority,text,false,Scalar alias storage candidate; semantics unproven,null
public,planner_parking_lot,r,color,text,false,Scalar alias storage candidate; semantics unproven,null
public,planner_parking_lot,r,checklist_json,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,Embedded checklist/reminder state; ownership follows characterized owning row
public,planner_parking_lot,r,reminder_json,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,Embedded checklist/reminder state; ownership follows characterized owning row
public,planner_parking_lot,r,metadata_json,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,Code: conversionType disambiguates converted_to_id
public,planner_parking_lot,r,converted_to_type,boolean,false,Identity-like name; semantics unproven,null
public,planner_parking_lot,r,converted_to_id,text,false,Identity-like name; semantics unproven,null
public,planner_profiles,r,id,text,true,Scalar alias storage candidate; semantics unproven,null
public,planner_profiles,r,weekStartDate,text,true,Scalar alias storage candidate; semantics unproven,null
public,planner_profiles,r,legacyImport,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,Global import snapshot; not automatically project-owned
public,planner_tasks,r,id,uuid,true,UUID storage; ownership unproven,null
public,planner_tasks,r,project_id,text,false,Identity-like name; semantics unproven,null
public,planner_tasks,r,title,text,false,Scalar alias storage candidate; semantics unproven,null
public,planner_tasks,r,source,text,false,Scalar alias storage candidate; semantics unproven,null
public,planner_tasks,r,category,text,false,Scalar alias storage candidate; semantics unproven,null
public,planner_tasks,r,state,text,false,Scalar alias storage candidate; semantics unproven,null
public,planner_tasks,r,priority,bigint,false,Scalar alias storage candidate; semantics unproven,null
public,planner_tasks,r,order,bigint,false,Scalar alias storage candidate; semantics unproven,null
public,planner_tasks,r,recurrence,text,false,Scalar alias storage candidate; semantics unproven,null
public,planner_tasks,r,metadata_json,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,"Code: series recurrence configuration, queue and queueOrder"
public,planner_tasks,r,project_registry_id,uuid,false,UUID storage; ownership unproven,null
public,planner_weekly_tasks,r,id,text,true,Scalar alias storage candidate; semantics unproven,null
public,planner_weekly_tasks,r,task_type,text,false,Scalar alias storage candidate; semantics unproven,null
public,planner_weekly_tasks,r,title,text,false,Scalar alias storage candidate; semantics unproven,null
public,planner_weekly_tasks,r,source,text,false,Scalar alias storage candidate; semantics unproven,null
public,planner_weekly_tasks,r,project_id,text,false,Identity-like name; semantics unproven,null
public,planner_weekly_tasks,r,parent_rep,text,false,Identity-like name; semantics unproven,null
public,planner_weekly_tasks,r,time_slot,text,false,Scalar alias storage candidate; semantics unproven,null
public,planner_weekly_tasks,r,bucket,text,false,Scalar alias storage candidate; semantics unproven,null
public,planner_weekly_tasks,r,checklist_json,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,Embedded checklist/reminder state; ownership follows characterized owning row
public,planner_weekly_tasks,r,reminder_json,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,Code: active/provider/eventId/sendAt; remote event may survive local row removal
public,planner_weekly_tasks,r,metadata_json,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,"Code: sourceTaskId, overrides and occurrence metadata"
public,project_registry,r,id,uuid,true,UUID storage; ownership unproven,null
public,project_registry,r,project_id,uuid,true,UUID storage; ownership unproven,null
public,project_registry,r,project_type,text,true,Identity-like name; semantics unproven,null
public,project_registry,r,title,text,true,Scalar alias storage candidate; semantics unproven,null
public,project_registry,r,category,text,false,Scalar alias storage candidate; semantics unproven,null
public,project_registry,r,priority,integer,false,Scalar alias storage candidate; semantics unproven,null
public,project_registry,r,metadata,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,null
public,project_registry,r,planner_task_id,uuid,false,UUID storage; ownership unproven,null
public,project_registry,r,recurrence,text,false,Scalar alias storage candidate; semantics unproven,null
public,project_registry,r,recurrence_rule,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,null
public,projects,r,id,text,true,Scalar alias storage candidate; semantics unproven,null
public,projects,r,source,text,true,Scalar alias storage candidate; semantics unproven,null
public,projects,r,title,text,true,Scalar alias storage candidate; semantics unproven,null
public,projects,r,category,text,true,Scalar alias storage candidate; semantics unproven,null
public,projects,r,state,text,true,Scalar alias storage candidate; semantics unproven,null
public,projects,r,resourceLinks,jsonb,true,Structured data; inspect explicit identity paths before assigning ownership,null
public,projects,r,metadata,jsonb,true,Structured data; inspect explicit identity paths before assigning ownership,null
public,projects_all,v,id,uuid,false,UUID storage; ownership unproven,null
public,projects_all,v,external_id,text,false,Identity-like name; semantics unproven,null
public,projects_all,v,project_type,text,false,Identity-like name; semantics unproven,null
public,projects_all,v,category,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_all,v,title,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_all,v,state,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_all,v,priority,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_all,v,order,integer,false,Scalar alias storage candidate; semantics unproven,null
public,projects_all,v,recurrence,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_all,v,metadata,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,null
public,projects_home,r,id,uuid,true,UUID storage; ownership unproven,null
public,projects_home,r,external_id,text,true,Identity-like name; semantics unproven,null
public,projects_home,r,category,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_home,r,state,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_home,r,priority,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_home,r,order,bigint,false,Scalar alias storage candidate; semantics unproven,null
public,projects_home,r,metadata,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,null
public,projects_home,r,property,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_home,r,area,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_home,r,title,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_home,r,resource_links,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,null
public,projects_home,r,cost,numeric,false,Scalar alias storage candidate; semantics unproven,null
public,projects_misc,r,id,uuid,true,UUID storage; ownership unproven,null
public,projects_misc,r,external_id,text,false,Identity-like name; semantics unproven,null
public,projects_misc,r,category,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_misc,r,title,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_misc,r,priority,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_misc,r,order,bigint,false,Scalar alias storage candidate; semantics unproven,null
public,projects_misc,r,resource_links,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,null
public,projects_misc,r,state,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_misc,r,metadata,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,null
public,projects_repeating,r,id,uuid,true,UUID storage; ownership unproven,null
public,projects_repeating,r,external_id,text,false,Identity-like name; semantics unproven,null
public,projects_repeating,r,property,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_repeating,r,state,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_repeating,r,category,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_repeating,r,task_description,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_repeating,r,recurrence,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_repeating,r,priority,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_repeating,r,order,bigint,false,Scalar alias storage candidate; semantics unproven,null
public,projects_repeating,r,title,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_repeating,r,metadata,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,null
public,projects_vehicle,r,id,uuid,true,UUID storage; ownership unproven,null
public,projects_vehicle,r,external_id,text,false,Identity-like name; semantics unproven,null
public,projects_vehicle,r,vehicle,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_vehicle,r,state,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_vehicle,r,category,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_vehicle,r,hours,numeric,false,Scalar alias storage candidate; semantics unproven,null
public,projects_vehicle,r,mileage,numeric,false,Scalar alias storage candidate; semantics unproven,null
public,projects_vehicle,r,mechanic,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_vehicle,r,service_description,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_vehicle,r,resource_links,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,null
public,projects_vehicle,r,order,bigint,false,Scalar alias storage candidate; semantics unproven,null
public,projects_vehicle,r,maintenance_checks,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,null
public,projects_vehicle,r,metadata,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,null
public,projects_vehicle,r,title,text,false,Scalar alias storage candidate; semantics unproven,null
public,projects_vehicle,r,priority,text,false,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,id,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,taskId,text,false,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,projectId,text,true,Identity-like name; semantics unproven,null
public,repeatable_masters,r,title,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,source,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,category,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,state,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,priority,integer,false,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,order,integer,false,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,recurrence,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,baseDay,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,monthWeek,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,baseBucket,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,startDate,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,originalStartDate,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,asset,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_masters,r,mileage,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_overrides,r,id,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_overrides,r,projectId,text,true,Identity-like name; semantics unproven,null
public,repeatable_overrides,r,title,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_overrides,r,category,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_overrides,r,state,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_overrides,r,priority,integer,false,Scalar alias storage candidate; semantics unproven,null
public,repeatable_overrides,r,order,integer,false,Scalar alias storage candidate; semantics unproven,null
public,repeatable_overrides,r,recurrence,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_overrides,r,baseDay,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_overrides,r,monthWeek,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_overrides,r,baseBucket,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_overrides,r,startDate,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_overrides,r,originalStartDate,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_overrides,r,asset,text,true,Scalar alias storage candidate; semantics unproven,null
public,repeatable_overrides,r,mileage,text,true,Scalar alias storage candidate; semantics unproven,null
public,staged_queue,r,profileId,text,true,Scalar alias storage candidate; semantics unproven,null
public,staged_queue,r,id,text,true,Scalar alias storage candidate; semantics unproven,null
public,staged_queue,r,position,bigint,true,Scalar alias storage candidate; semantics unproven,null
public,staged_queue,r,item,jsonb,true,Structured data; inspect explicit identity paths before assigning ownership,Historical migration JSON queue snapshot; live use unverified
public,task_manager,r,id,text,true,Scalar alias storage candidate; semantics unproven,null
public,task_manager,r,projectId,text,true,Identity-like name; semantics unproven,null
public,task_manager,r,title,text,true,Scalar alias storage candidate; semantics unproven,null
public,task_manager,r,source,text,true,Scalar alias storage candidate; semantics unproven,null
public,task_manager,r,category,text,true,Scalar alias storage candidate; semantics unproven,null
public,task_manager,r,state,text,true,Scalar alias storage candidate; semantics unproven,null
public,task_manager,r,priority,integer,false,Scalar alias storage candidate; semantics unproven,null
public,task_manager,r,order,integer,false,Scalar alias storage candidate; semantics unproven,null
public,task_manager,r,recurrence,text,true,Scalar alias storage candidate; semantics unproven,null
public,task_manager,r,startDate,text,true,Scalar alias storage candidate; semantics unproven,null
public,task_manager,r,metadataJson,jsonb,true,Structured data; inspect explicit identity paths before assigning ownership,null
public,trips,r,id,text,true,Scalar alias storage candidate; semantics unproven,null
public,trips,r,destination,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips,r,trip_type,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips,r,status,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips,r,timeline_month,smallint,false,Scalar alias storage candidate; semantics unproven,null
public,trips,r,timeline_year,smallint,false,Scalar alias storage candidate; semantics unproven,null
public,trips,r,notes,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips,r,duration,smallint,false,Scalar alias storage candidate; semantics unproven,null
public,trips,r,seasonality,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips,r,cost_range,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips,r,considerations,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips,r,tags,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips,r,links,jsonb,false,Structured data; inspect explicit identity paths before assigning ownership,null
public,trips,r,priority,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips,r,purpose,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips,r,location,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips_timeline,r,year,integer,true,Scalar alias storage candidate; semantics unproven,null
public,trips_timeline,r,month,text,true,Scalar alias storage candidate; semantics unproven,null
public,trips_timeline,r,color,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips_timeline,r,notes,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips_timeline,r,blocks,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips_workflow_metadata,r,id,uuid,true,UUID storage; ownership unproven,null
public,trips_workflow_metadata,r,stage,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips_workflow_metadata,r,stage_notes,text,false,Scalar alias storage candidate; semantics unproven,null
public,trips_workflow_metadata,r,trip_id,uuid,false,UUID storage; ownership unproven,null
public,weekly_tasks,r,id,text,true,Scalar alias storage candidate; semantics unproven,null
public,weekly_tasks,r,taskId,text,false,Scalar alias storage candidate; semantics unproven,null
public,weekly_tasks,r,taskType,text,true,Scalar alias storage candidate; semantics unproven,null
public,weekly_tasks,r,type,text,true,Scalar alias storage candidate; semantics unproven,null
public,weekly_tasks,r,title,text,true,Scalar alias storage candidate; semantics unproven,null
public,weekly_tasks,r,source,text,true,Scalar alias storage candidate; semantics unproven,null
public,weekly_tasks,r,projectId,text,true,Identity-like name; semantics unproven,null
public,weekly_tasks,r,parentRepeatableId,text,true,Identity-like name; semantics unproven,null
public,weekly_tasks,r,occurrenceDate,text,true,Scalar alias storage candidate; semantics unproven,null
public,weekly_tasks,r,date,text,true,Scalar alias storage candidate; semantics unproven,null
public,weekly_tasks,r,timeSlot,text,true,Scalar alias storage candidate; semantics unproven,null
public,weekly_tasks,r,bucket,text,true,Scalar alias storage candidate; semantics unproven,null
public,weekly_tasks,r,checklistJson,jsonb,true,Structured data; inspect explicit identity paths before assigning ownership,Embedded checklist/reminder state; ownership follows characterized owning row
public,weekly_tasks,r,reminderJson,jsonb,true,Structured data; inspect explicit identity paths before assigning ownership,Embedded checklist/reminder state; ownership follows characterized owning row
public,weekly_tasks,r,metadataJson,jsonb,true,Structured data; inspect explicit identity paths before assigning ownership,null
public,weekly_tasks,r,priority,integer,false,Scalar alias storage candidate; semantics unproven,null
public,weekly_tasks,r,recurrence,text,true,Scalar alias storage candidate; semantics unproven,null
public,weekly_tasks,r,order,integer,false,Scalar alias storage candidate; semantics unproven,null