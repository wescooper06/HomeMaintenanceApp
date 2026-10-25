schema_name,relation_name,column_name,position,data_type,not_null,column_default,identity_kind,generated_kind,attacl
auth,audit_log_entries,instance_id,1,uuid,false,null,,,null
auth,audit_log_entries,id,2,uuid,true,null,,,null
auth,audit_log_entries,payload,3,json,false,null,,,null
auth,audit_log_entries,created_at,4,timestamp with time zone,false,null,,,null
auth,audit_log_entries,ip_address,5,character varying(64),true,''::character varying,,,null
auth,custom_oauth_providers,id,1,uuid,true,gen_random_uuid(),,,null
auth,custom_oauth_providers,provider_type,2,text,true,null,,,null
auth,custom_oauth_providers,identifier,3,text,true,null,,,null
auth,custom_oauth_providers,name,4,text,true,null,,,null
auth,custom_oauth_providers,client_id,5,text,true,null,,,null
auth,custom_oauth_providers,client_secret,6,text,true,null,,,null
auth,custom_oauth_providers,acceptable_client_ids,7,text[],true,'{}'::text[],,,null
auth,custom_oauth_providers,scopes,8,text[],true,'{}'::text[],,,null
auth,custom_oauth_providers,pkce_enabled,9,boolean,true,true,,,null
auth,custom_oauth_providers,attribute_mapping,10,jsonb,true,'{}'::jsonb,,,null
auth,custom_oauth_providers,authorization_params,11,jsonb,true,'{}'::jsonb,,,null
auth,custom_oauth_providers,enabled,12,boolean,true,true,,,null
auth,custom_oauth_providers,email_optional,13,boolean,true,false,,,null
auth,custom_oauth_providers,issuer,14,text,false,null,,,null
auth,custom_oauth_providers,discovery_url,15,text,false,null,,,null
auth,custom_oauth_providers,skip_nonce_check,16,boolean,true,false,,,null
auth,custom_oauth_providers,cached_discovery,17,jsonb,false,null,,,null
auth,custom_oauth_providers,discovery_cached_at,18,timestamp with time zone,false,null,,,null
auth,custom_oauth_providers,authorization_url,19,text,false,null,,,null
auth,custom_oauth_providers,token_url,20,text,false,null,,,null
auth,custom_oauth_providers,userinfo_url,21,text,false,null,,,null
auth,custom_oauth_providers,jwks_uri,22,text,false,null,,,null
auth,custom_oauth_providers,created_at,23,timestamp with time zone,true,now(),,,null
auth,custom_oauth_providers,updated_at,24,timestamp with time zone,true,now(),,,null
auth,custom_oauth_providers,custom_claims_allowlist,25,text[],true,'{}'::text[],,,null
auth,flow_state,id,1,uuid,true,null,,,null
auth,flow_state,user_id,2,uuid,false,null,,,null
auth,flow_state,auth_code,3,text,false,null,,,null
auth,flow_state,code_challenge_method,4,auth.code_challenge_method,false,null,,,null
auth,flow_state,code_challenge,5,text,false,null,,,null
auth,flow_state,provider_type,6,text,true,null,,,null
auth,flow_state,provider_access_token,7,text,false,null,,,null
auth,flow_state,provider_refresh_token,8,text,false,null,,,null
auth,flow_state,created_at,9,timestamp with time zone,false,null,,,null
auth,flow_state,updated_at,10,timestamp with time zone,false,null,,,null
auth,flow_state,authentication_method,11,text,true,null,,,null
auth,flow_state,auth_code_issued_at,12,timestamp with time zone,false,null,,,null
auth,flow_state,invite_token,13,text,false,null,,,null
auth,flow_state,referrer,14,text,false,null,,,null
auth,flow_state,oauth_client_state_id,15,uuid,false,null,,,null
auth,flow_state,linking_target_id,16,uuid,false,null,,,null
auth,flow_state,email_optional,17,boolean,true,false,,,null
auth,identities,provider_id,1,text,true,null,,,null
auth,identities,user_id,2,uuid,true,null,,,null
auth,identities,identity_data,3,jsonb,true,null,,,null
auth,identities,provider,4,text,true,null,,,null
auth,identities,last_sign_in_at,5,timestamp with time zone,false,null,,,null
auth,identities,created_at,6,timestamp with time zone,false,null,,,null
auth,identities,updated_at,7,timestamp with time zone,false,null,,,null
auth,identities,email,8,text,false,lower((identity_data ->> 'email'::text)),,s,null
auth,identities,id,9,uuid,true,gen_random_uuid(),,,null
auth,instances,id,1,uuid,true,null,,,null
auth,instances,uuid,2,uuid,false,null,,,null
auth,instances,raw_base_config,3,text,false,null,,,null
auth,instances,created_at,4,timestamp with time zone,false,null,,,null
auth,instances,updated_at,5,timestamp with time zone,false,null,,,null
auth,mfa_amr_claims,session_id,1,uuid,true,null,,,null
auth,mfa_amr_claims,created_at,2,timestamp with time zone,true,null,,,null
auth,mfa_amr_claims,updated_at,3,timestamp with time zone,true,null,,,null
auth,mfa_amr_claims,authentication_method,4,text,true,null,,,null
auth,mfa_amr_claims,id,5,uuid,true,null,,,null
auth,mfa_challenges,id,1,uuid,true,null,,,null
auth,mfa_challenges,factor_id,2,uuid,true,null,,,null
auth,mfa_challenges,created_at,3,timestamp with time zone,true,null,,,null
auth,mfa_challenges,verified_at,4,timestamp with time zone,false,null,,,null
auth,mfa_challenges,ip_address,5,inet,true,null,,,null
auth,mfa_challenges,otp_code,6,text,false,null,,,null
auth,mfa_challenges,web_authn_session_data,7,jsonb,false,null,,,null
auth,mfa_factors,id,1,uuid,true,null,,,null
auth,mfa_factors,user_id,2,uuid,true,null,,,null
auth,mfa_factors,friendly_name,3,text,false,null,,,null
auth,mfa_factors,factor_type,4,auth.factor_type,true,null,,,null
auth,mfa_factors,status,5,auth.factor_status,true,null,,,null
auth,mfa_factors,created_at,6,timestamp with time zone,true,null,,,null
auth,mfa_factors,updated_at,7,timestamp with time zone,true,null,,,null
auth,mfa_factors,secret,8,text,false,null,,,null
auth,mfa_factors,phone,9,text,false,null,,,null
auth,mfa_factors,last_challenged_at,10,timestamp with time zone,false,null,,,null
auth,mfa_factors,web_authn_credential,11,jsonb,false,null,,,null
auth,mfa_factors,web_authn_aaguid,12,uuid,false,null,,,null
auth,mfa_factors,last_webauthn_challenge_data,13,jsonb,false,null,,,null
auth,mfa_recovery_code_sets,id,1,uuid,true,null,,,null
auth,mfa_recovery_code_sets,user_id,2,uuid,true,null,,,null
auth,mfa_recovery_code_sets,mfa_factor_id,3,uuid,true,null,,,null
auth,mfa_recovery_code_sets,failed_verification_count,4,integer,true,0,,,null
auth,mfa_recovery_code_sets,verification_locked_until,5,timestamp with time zone,false,null,,,null
auth,mfa_recovery_code_sets,created_at,6,timestamp with time zone,true,now(),,,null
auth,mfa_recovery_code_sets,updated_at,7,timestamp with time zone,true,now(),,,null
auth,mfa_recovery_codes,id,1,uuid,true,null,,,null
auth,mfa_recovery_codes,mfa_recovery_code_set_id,2,uuid,true,null,,,null
auth,mfa_recovery_codes,code_hash,3,text,true,null,,,null
auth,mfa_recovery_codes,consumed_at,4,timestamp with time zone,false,null,,,null
auth,mfa_recovery_codes,created_at,5,timestamp with time zone,true,now(),,,null
auth,oauth_authorizations,id,1,uuid,true,null,,,null
auth,oauth_authorizations,authorization_id,2,text,true,null,,,null
auth,oauth_authorizations,client_id,3,uuid,true,null,,,null
auth,oauth_authorizations,user_id,4,uuid,false,null,,,null
auth,oauth_authorizations,redirect_uri,5,text,true,null,,,null
auth,oauth_authorizations,scope,6,text,true,null,,,null
auth,oauth_authorizations,state,7,text,false,null,,,null
auth,oauth_authorizations,resource,8,text,false,null,,,null
auth,oauth_authorizations,code_challenge,9,text,false,null,,,null
auth,oauth_authorizations,code_challenge_method,10,auth.code_challenge_method,false,null,,,null
auth,oauth_authorizations,response_type,11,auth.oauth_response_type,true,'code'::auth.oauth_response_type,,,null
auth,oauth_authorizations,status,12,auth.oauth_authorization_status,true,'pending'::auth.oauth_authorization_status,,,null
auth,oauth_authorizations,authorization_code,13,text,false,null,,,null
auth,oauth_authorizations,created_at,14,timestamp with time zone,true,now(),,,null
auth,oauth_authorizations,expires_at,15,timestamp with time zone,true,(now() + '00:03:00'::interval),,,null
auth,oauth_authorizations,approved_at,16,timestamp with time zone,false,null,,,null
auth,oauth_authorizations,nonce,17,text,false,null,,,null
auth,oauth_client_states,id,1,uuid,true,null,,,null
auth,oauth_client_states,provider_type,2,text,true,null,,,null
auth,oauth_client_states,code_verifier,3,text,false,null,,,null
auth,oauth_client_states,created_at,4,timestamp with time zone,true,null,,,null
auth,oauth_clients,id,1,uuid,true,null,,,null
auth,oauth_clients,client_secret_hash,3,text,false,null,,,null
auth,oauth_clients,registration_type,4,auth.oauth_registration_type,true,null,,,null
auth,oauth_clients,redirect_uris,5,text,true,null,,,null
auth,oauth_clients,grant_types,6,text,true,null,,,null
auth,oauth_clients,client_name,7,text,false,null,,,null
auth,oauth_clients,client_uri,8,text,false,null,,,null
auth,oauth_clients,logo_uri,9,text,false,null,,,null
auth,oauth_clients,created_at,10,timestamp with time zone,true,now(),,,null
auth,oauth_clients,updated_at,11,timestamp with time zone,true,now(),,,null
auth,oauth_clients,deleted_at,12,timestamp with time zone,false,null,,,null
auth,oauth_clients,client_type,13,auth.oauth_client_type,true,'confidential'::auth.oauth_client_type,,,null
auth,oauth_clients,token_endpoint_auth_method,14,text,true,null,,,null
auth,oauth_consents,id,1,uuid,true,null,,,null
auth,oauth_consents,user_id,2,uuid,true,null,,,null
auth,oauth_consents,client_id,3,uuid,true,null,,,null
auth,oauth_consents,scopes,4,text,true,null,,,null
auth,oauth_consents,granted_at,5,timestamp with time zone,true,now(),,,null
auth,oauth_consents,revoked_at,6,timestamp with time zone,false,null,,,null
auth,one_time_tokens,id,1,uuid,true,null,,,null
auth,one_time_tokens,user_id,2,uuid,true,null,,,null
auth,one_time_tokens,token_type,3,auth.one_time_token_type,true,null,,,null
auth,one_time_tokens,token_hash,4,text,true,null,,,null
auth,one_time_tokens,relates_to,5,text,true,null,,,null
auth,one_time_tokens,created_at,6,timestamp without time zone,true,now(),,,null
auth,one_time_tokens,updated_at,7,timestamp without time zone,true,now(),,,null
auth,one_time_tokens,expires_at,8,timestamp with time zone,false,null,,,null
auth,refresh_tokens,instance_id,1,uuid,false,null,,,null
auth,refresh_tokens,id,2,bigint,true,nextval('auth.refresh_tokens_id_seq'::regclass),,,null
auth,refresh_tokens,token,3,character varying(255),false,null,,,null
auth,refresh_tokens,user_id,4,character varying(255),false,null,,,null
auth,refresh_tokens,revoked,5,boolean,false,null,,,null
auth,refresh_tokens,created_at,6,timestamp with time zone,false,null,,,null
auth,refresh_tokens,updated_at,7,timestamp with time zone,false,null,,,null
auth,refresh_tokens,parent,8,character varying(255),false,null,,,null
auth,refresh_tokens,session_id,9,uuid,false,null,,,null
auth,saml_providers,id,1,uuid,true,null,,,null
auth,saml_providers,sso_provider_id,2,uuid,true,null,,,null
auth,saml_providers,entity_id,3,text,true,null,,,null
auth,saml_providers,metadata_xml,4,text,true,null,,,null
auth,saml_providers,metadata_url,5,text,false,null,,,null
auth,saml_providers,attribute_mapping,6,jsonb,false,null,,,null
auth,saml_providers,created_at,7,timestamp with time zone,false,null,,,null
auth,saml_providers,updated_at,8,timestamp with time zone,false,null,,,null
auth,saml_providers,name_id_format,9,text,false,null,,,null
auth,saml_relay_states,id,1,uuid,true,null,,,null
auth,saml_relay_states,sso_provider_id,2,uuid,true,null,,,null
auth,saml_relay_states,request_id,3,text,true,null,,,null
auth,saml_relay_states,for_email,4,text,false,null,,,null
auth,saml_relay_states,redirect_to,5,text,false,null,,,null
auth,saml_relay_states,created_at,7,timestamp with time zone,false,null,,,null
auth,saml_relay_states,updated_at,8,timestamp with time zone,false,null,,,null
auth,saml_relay_states,flow_state_id,9,uuid,false,null,,,null
auth,schema_migrations,version,1,character varying(255),true,null,,,null
auth,scim_tokens,id,1,uuid,true,null,,,null
auth,scim_tokens,sso_provider_id,2,uuid,true,null,,,null
auth,scim_tokens,token_hash,3,text,true,null,,,null
auth,scim_tokens,prefix,4,text,true,null,,,null
auth,scim_tokens,created_at,5,timestamp with time zone,true,now(),,,null
auth,scim_tokens,expires_at,6,timestamp with time zone,false,null,,,null
auth,scim_tokens,revoked_at,7,timestamp with time zone,false,null,,,null
auth,scim_tokens,last_used_at,8,timestamp with time zone,false,null,,,null
auth,scim_users,id,1,uuid,true,null,,,null
auth,scim_users,sso_provider_id,2,uuid,true,null,,,null
auth,scim_users,user_id,3,uuid,false,null,,,null
auth,scim_users,resource,4,jsonb,true,null,,,null
auth,scim_users,user_name,5,text,true,lower((resource ->> 'userName'::text)),,s,null
auth,scim_users,external_id,6,text,false,(resource ->> 'externalId'::text),,s,null
auth,scim_users,active,7,boolean,true,"COALESCE(((resource ->> 'active'::text))::boolean, true)",,s,null
auth,scim_users,created_at,8,timestamp with time zone,true,now(),,,null
auth,scim_users,updated_at,9,timestamp with time zone,true,now(),,,null
auth,scim_users,deleted_at,10,timestamp with time zone,false,null,,,null
auth,sessions,id,1,uuid,true,null,,,null
auth,sessions,user_id,2,uuid,true,null,,,null
auth,sessions,created_at,3,timestamp with time zone,false,null,,,null
auth,sessions,updated_at,4,timestamp with time zone,false,null,,,null
auth,sessions,factor_id,5,uuid,false,null,,,null
auth,sessions,aal,6,auth.aal_level,false,null,,,null
auth,sessions,not_after,7,timestamp with time zone,false,null,,,null
auth,sessions,refreshed_at,8,timestamp without time zone,false,null,,,null
auth,sessions,user_agent,9,text,false,null,,,null
auth,sessions,ip,10,inet,false,null,,,null
auth,sessions,tag,11,text,false,null,,,null
auth,sessions,oauth_client_id,12,uuid,false,null,,,null
auth,sessions,refresh_token_hmac_key,13,text,false,null,,,null
auth,sessions,refresh_token_counter,14,bigint,false,null,,,null
auth,sessions,scopes,15,text,false,null,,,null
auth,sso_domains,id,1,uuid,true,null,,,null
auth,sso_domains,sso_provider_id,2,uuid,true,null,,,null
auth,sso_domains,domain,3,text,true,null,,,null
auth,sso_domains,created_at,4,timestamp with time zone,false,null,,,null
auth,sso_domains,updated_at,5,timestamp with time zone,false,null,,,null
auth,sso_providers,id,1,uuid,true,null,,,null
auth,sso_providers,resource_id,2,text,false,null,,,null
auth,sso_providers,created_at,3,timestamp with time zone,false,null,,,null
auth,sso_providers,updated_at,4,timestamp with time zone,false,null,,,null
auth,sso_providers,disabled,5,boolean,false,null,,,null
auth,users,instance_id,1,uuid,false,null,,,null
auth,users,id,2,uuid,true,null,,,null
auth,users,aud,3,character varying(255),false,null,,,null
auth,users,role,4,character varying(255),false,null,,,null
auth,users,email,5,character varying(255),false,null,,,null
auth,users,encrypted_password,6,character varying(255),false,null,,,null
auth,users,email_confirmed_at,7,timestamp with time zone,false,null,,,null
auth,users,invited_at,8,timestamp with time zone,false,null,,,null
auth,users,confirmation_token,9,character varying(255),false,null,,,null
auth,users,confirmation_sent_at,10,timestamp with time zone,false,null,,,null
auth,users,recovery_token,11,character varying(255),false,null,,,null
auth,users,recovery_sent_at,12,timestamp with time zone,false,null,,,null
auth,users,email_change_token_new,13,character varying(255),false,null,,,null
auth,users,email_change,14,character varying(255),false,null,,,null
auth,users,email_change_sent_at,15,timestamp with time zone,false,null,,,null
auth,users,last_sign_in_at,16,timestamp with time zone,false,null,,,null
auth,users,raw_app_meta_data,17,jsonb,false,null,,,null
auth,users,raw_user_meta_data,18,jsonb,false,null,,,null
auth,users,is_super_admin,19,boolean,false,null,,,null
auth,users,created_at,20,timestamp with time zone,false,null,,,null
auth,users,updated_at,21,timestamp with time zone,false,null,,,null
auth,users,phone,22,text,false,NULL::character varying,,,null
auth,users,phone_confirmed_at,23,timestamp with time zone,false,null,,,null
auth,users,phone_change,24,text,false,''::character varying,,,null
auth,users,phone_change_token,25,character varying(255),false,''::character varying,,,null
auth,users,phone_change_sent_at,26,timestamp with time zone,false,null,,,null
auth,users,confirmed_at,27,timestamp with time zone,false,"LEAST(email_confirmed_at, phone_confirmed_at)",,s,null
auth,users,email_change_token_current,28,character varying(255),false,''::character varying,,,null
auth,users,email_change_confirm_status,29,smallint,false,0,,,null
auth,users,banned_until,30,timestamp with time zone,false,null,,,null
auth,users,reauthentication_token,31,character varying(255),false,''::character varying,,,null
auth,users,reauthentication_sent_at,32,timestamp with time zone,false,null,,,null
auth,users,is_sso_user,33,boolean,true,false,,,null
auth,users,deleted_at,34,timestamp with time zone,false,null,,,null
auth,users,is_anonymous,35,boolean,true,false,,,null
auth,webauthn_challenges,id,1,uuid,true,gen_random_uuid(),,,null
auth,webauthn_challenges,user_id,2,uuid,false,null,,,null
auth,webauthn_challenges,challenge_type,3,text,true,null,,,null
auth,webauthn_challenges,session_data,4,jsonb,true,null,,,null
auth,webauthn_challenges,created_at,5,timestamp with time zone,true,now(),,,null
auth,webauthn_challenges,expires_at,6,timestamp with time zone,true,null,,,null
auth,webauthn_credentials,id,1,uuid,true,gen_random_uuid(),,,null
auth,webauthn_credentials,user_id,2,uuid,true,null,,,null
auth,webauthn_credentials,credential_id,3,bytea,true,null,,,null
auth,webauthn_credentials,public_key,4,bytea,true,null,,,null
auth,webauthn_credentials,attestation_type,5,text,true,''::text,,,null
auth,webauthn_credentials,aaguid,6,uuid,false,null,,,null
auth,webauthn_credentials,sign_count,7,bigint,true,0,,,null
auth,webauthn_credentials,transports,8,jsonb,true,'[]'::jsonb,,,null
auth,webauthn_credentials,backup_eligible,9,boolean,true,false,,,null
auth,webauthn_credentials,backed_up,10,boolean,true,false,,,null
auth,webauthn_credentials,friendly_name,11,text,true,''::text,,,null
auth,webauthn_credentials,created_at,12,timestamp with time zone,true,now(),,,null
auth,webauthn_credentials,updated_at,13,timestamp with time zone,true,now(),,,null
auth,webauthn_credentials,last_used_at,14,timestamp with time zone,false,null,,,null
extensions,pg_stat_statements,userid,1,oid,false,null,,,null
extensions,pg_stat_statements,dbid,2,oid,false,null,,,null
extensions,pg_stat_statements,toplevel,3,boolean,false,null,,,null
extensions,pg_stat_statements,queryid,4,bigint,false,null,,,null
extensions,pg_stat_statements,query,5,text,false,null,,,null
extensions,pg_stat_statements,plans,6,bigint,false,null,,,null
extensions,pg_stat_statements,total_plan_time,7,double precision,false,null,,,null
extensions,pg_stat_statements,min_plan_time,8,double precision,false,null,,,null
extensions,pg_stat_statements,max_plan_time,9,double precision,false,null,,,null
extensions,pg_stat_statements,mean_plan_time,10,double precision,false,null,,,null
extensions,pg_stat_statements,stddev_plan_time,11,double precision,false,null,,,null
extensions,pg_stat_statements,calls,12,bigint,false,null,,,null
extensions,pg_stat_statements,total_exec_time,13,double precision,false,null,,,null
extensions,pg_stat_statements,min_exec_time,14,double precision,false,null,,,null
extensions,pg_stat_statements,max_exec_time,15,double precision,false,null,,,null
extensions,pg_stat_statements,mean_exec_time,16,double precision,false,null,,,null
extensions,pg_stat_statements,stddev_exec_time,17,double precision,false,null,,,null
extensions,pg_stat_statements,rows,18,bigint,false,null,,,null
extensions,pg_stat_statements,shared_blks_hit,19,bigint,false,null,,,null
extensions,pg_stat_statements,shared_blks_read,20,bigint,false,null,,,null
extensions,pg_stat_statements,shared_blks_dirtied,21,bigint,false,null,,,null
extensions,pg_stat_statements,shared_blks_written,22,bigint,false,null,,,null
extensions,pg_stat_statements,local_blks_hit,23,bigint,false,null,,,null
extensions,pg_stat_statements,local_blks_read,24,bigint,false,null,,,null
extensions,pg_stat_statements,local_blks_dirtied,25,bigint,false,null,,,null
extensions,pg_stat_statements,local_blks_written,26,bigint,false,null,,,null
extensions,pg_stat_statements,temp_blks_read,27,bigint,false,null,,,null
extensions,pg_stat_statements,temp_blks_written,28,bigint,false,null,,,null
extensions,pg_stat_statements,shared_blk_read_time,29,double precision,false,null,,,null
extensions,pg_stat_statements,shared_blk_write_time,30,double precision,false,null,,,null
extensions,pg_stat_statements,local_blk_read_time,31,double precision,false,null,,,null
extensions,pg_stat_statements,local_blk_write_time,32,double precision,false,null,,,null
extensions,pg_stat_statements,temp_blk_read_time,33,double precision,false,null,,,null
extensions,pg_stat_statements,temp_blk_write_time,34,double precision,false,null,,,null
extensions,pg_stat_statements,wal_records,35,bigint,false,null,,,null
extensions,pg_stat_statements,wal_fpi,36,bigint,false,null,,,null
extensions,pg_stat_statements,wal_bytes,37,numeric,false,null,,,null
extensions,pg_stat_statements,jit_functions,38,bigint,false,null,,,null
extensions,pg_stat_statements,jit_generation_time,39,double precision,false,null,,,null
extensions,pg_stat_statements,jit_inlining_count,40,bigint,false,null,,,null
extensions,pg_stat_statements,jit_inlining_time,41,double precision,false,null,,,null
extensions,pg_stat_statements,jit_optimization_count,42,bigint,false,null,,,null
extensions,pg_stat_statements,jit_optimization_time,43,double precision,false,null,,,null
extensions,pg_stat_statements,jit_emission_count,44,bigint,false,null,,,null
extensions,pg_stat_statements,jit_emission_time,45,double precision,false,null,,,null
extensions,pg_stat_statements,jit_deform_count,46,bigint,false,null,,,null
extensions,pg_stat_statements,jit_deform_time,47,double precision,false,null,,,null
extensions,pg_stat_statements,stats_since,48,timestamp with time zone,false,null,,,null
extensions,pg_stat_statements,minmax_stats_since,49,timestamp with time zone,false,null,,,null
extensions,pg_stat_statements_info,dealloc,1,bigint,false,null,,,null
extensions,pg_stat_statements_info,stats_reset,2,timestamp with time zone,false,null,,,null
public,activity_rules,days,2,text,true,null,,,null
public,activity_rules,start_time,3,time without time zone,false,null,,,null
public,activity_rules,end_time,4,time without time zone,false,null,,,null
public,activity_rules,activity_type_id,5,text,false,null,,,null
public,activity_rules,recurrence,6,text,false,null,,,null
public,activity_rules,allow_override,7,boolean,false,null,,,null
public,activity_rules,priority,8,smallint,false,null,,,null
public,activity_rules,notes,9,text,false,null,,,null
public,activity_rules,id,10,uuid,true,gen_random_uuid(),,,null
public,activity_types,id,1,text,true,null,,,null
public,activity_types,name,2,text,true,null,,,null
public,activity_types,color,3,text,false,null,,,null
public,activity_types,category,4,text,false,null,,,null
public,activity_types,notes,5,text,false,null,,,null
public,activity_weekly_grid,day,1,text,true,null,,,null
public,activity_weekly_grid,time,2,time without time zone,true,null,,,null
public,activity_weekly_grid,activity_type_id,3,text,false,null,,,null
public,activity_weekly_grid,rule_id,4,uuid,false,gen_random_uuid(),,,null
public,curated_queue,profileId,1,text,true,null,,,null
public,curated_queue,taskId,2,text,true,null,,,null
public,curated_queue,position,3,bigint,true,null,,,null
public,curated_queue,item,4,jsonb,true,null,,,null
public,parking_lot,profileId,1,text,true,null,,,null
public,parking_lot,id,2,text,true,null,,,null
public,parking_lot,position,3,bigint,true,null,a,,null
public,parking_lot,title,4,text,true,'Untitled Idea'::text,,,null
public,parking_lot,notes,5,text,true,''::text,,,null
public,parking_lot,createdAt,6,text,true,''::text,,,null
public,parking_lot,updatedAt,7,text,true,''::text,,,null
public,parking_lot,source,8,text,true,'parking-lot'::text,,,null
public,parking_lot,tags,9,text,true,''::text,,,null
public,parking_lot,priority,10,text,true,'low'::text,,,null
public,parking_lot,convertedTo,11,jsonb,false,null,,,null
public,parking_lot,color,12,text,true,''::text,,,null
public,parking_lot,checklistJson,13,jsonb,true,'[]'::jsonb,,,null
public,parking_lot,reminderJson,14,jsonb,true,'{}'::jsonb,,,null
public,parking_lot,metadataJson,15,jsonb,true,'{}'::jsonb,,,null
public,parking_lot,deleted,16,boolean,true,false,,,null
public,parking_lot,archived,17,boolean,true,false,,,null
public,parking_lot,convertedFromParking,18,text,true,''::text,,,null
public,planner_parking_lot,id,1,text,true,null,,,null
public,planner_parking_lot,created_at,2,timestamp with time zone,true,now(),,,null
public,planner_parking_lot,title,3,text,false,null,,,null
public,planner_parking_lot,notes,4,text,false,null,,,null
public,planner_parking_lot,tags,5,text,false,null,,,null
public,planner_parking_lot,priority,6,text,false,null,,,null
public,planner_parking_lot,color,7,text,false,null,,,null
public,planner_parking_lot,checklist_json,8,jsonb,false,null,,,null
public,planner_parking_lot,reminder_json,9,jsonb,false,null,,,null
public,planner_parking_lot,metadata_json,10,jsonb,false,null,,,null
public,planner_parking_lot,converted_to_type,11,boolean,false,null,,,null
public,planner_parking_lot,converted_to_id,12,text,false,null,,,null
public,planner_parking_lot,updated_at,13,timestamp without time zone,false,now(),,,null
public,planner_parking_lot,deleted,14,boolean,false,null,,,null
public,planner_profiles,id,1,text,true,null,,,null
public,planner_profiles,weekStartDate,2,text,true,''::text,,,null
public,planner_profiles,legacyImport,3,jsonb,false,null,,,null
public,planner_tasks,id,1,uuid,true,gen_random_uuid(),,,null
public,planner_tasks,created_at,2,timestamp with time zone,true,now(),,,null
public,planner_tasks,project_id,3,text,false,null,,,null
public,planner_tasks,title,4,text,false,null,,,null
public,planner_tasks,source,5,text,false,null,,,null
public,planner_tasks,category,6,text,false,null,,,null
public,planner_tasks,state,7,text,false,null,,,null
public,planner_tasks,priority,8,bigint,false,null,,,null
public,planner_tasks,order,9,bigint,false,null,,,null
public,planner_tasks,recurrence,10,text,false,null,,,null
public,planner_tasks,start_date,11,timestamp without time zone,false,null,,,null
public,planner_tasks,updated_at,12,timestamp without time zone,false,null,,,null
public,planner_tasks,metadata_json,13,jsonb,false,null,,,null
public,planner_tasks,deleted,14,boolean,false,null,,,null
public,planner_tasks,project_registry_id,15,uuid,false,null,,,null
public,planner_weekly_tasks,id,1,text,true,null,,,null
public,planner_weekly_tasks,created_at,2,timestamp with time zone,true,now(),,,null
public,planner_weekly_tasks,task_type,3,text,false,null,,,null
public,planner_weekly_tasks,title,4,text,false,null,,,null
public,planner_weekly_tasks,source,5,text,false,null,,,null
public,planner_weekly_tasks,project_id,6,text,false,null,,,null
public,planner_weekly_tasks,parent_rep,7,text,false,null,,,null
public,planner_weekly_tasks,occurrence_date,8,date,false,null,,,null
public,planner_weekly_tasks,date,9,date,false,null,,,null
public,planner_weekly_tasks,time_slot,10,text,false,null,,,null
public,planner_weekly_tasks,bucket,11,text,false,null,,,null
public,planner_weekly_tasks,completed,12,boolean,false,null,,,null
public,planner_weekly_tasks,overridden,13,boolean,false,null,,,null
public,planner_weekly_tasks,deleted_instance,14,boolean,false,null,,,null
public,planner_weekly_tasks,checklist_json,15,jsonb,false,null,,,null
public,planner_weekly_tasks,reminder_json,16,jsonb,false,null,,,null
public,planner_weekly_tasks,metadata_json,17,jsonb,false,null,,,null
public,planner_weekly_tasks,updated_at,18,timestamp without time zone,false,null,,,null
public,planner_weekly_tasks,deleted,19,boolean,false,null,,,null
public,planner_weekly_tasks,checklist_open,20,boolean,false,null,,,null
public,project_registry,id,1,uuid,true,gen_random_uuid(),,,null
public,project_registry,project_id,2,uuid,true,null,,,null
public,project_registry,project_type,3,text,true,null,,,null
public,project_registry,title,4,text,true,null,,,null
public,project_registry,category,5,text,false,null,,,null
public,project_registry,priority,6,integer,false,null,,,null
public,project_registry,metadata,7,jsonb,false,null,,,null
public,project_registry,planner_task_id,8,uuid,false,null,,,null
public,project_registry,last_completed_at,9,timestamp with time zone,false,null,,,null
public,project_registry,next_scheduled_at,10,timestamp with time zone,false,null,,,null
public,project_registry,recurrence,11,text,false,null,,,null
public,project_registry,recurrence_rule,12,jsonb,false,null,,,null
public,project_registry,created_at,13,timestamp with time zone,false,now(),,,null
public,project_registry,updated_at,14,timestamp with time zone,false,now(),,,null
public,projects,id,1,text,true,null,,,null
public,projects,source,2,text,true,null,,,null
public,projects,title,3,text,true,'Untitled Project'::text,,,null
public,projects,category,4,text,true,'uncategorized'::text,,,null
public,projects,state,5,text,true,'unknown'::text,,,null
public,projects,resourceLinks,6,jsonb,true,'[]'::jsonb,,,null
public,projects,metadata,7,jsonb,true,'{}'::jsonb,,,null
public,projects_all,id,1,uuid,false,null,,,null
public,projects_all,external_id,2,text,false,null,,,null
public,projects_all,project_type,3,text,false,null,,,null
public,projects_all,category,4,text,false,null,,,null
public,projects_all,title,5,text,false,null,,,null
public,projects_all,state,6,text,false,null,,,null
public,projects_all,priority,7,text,false,null,,,null
public,projects_all,order,8,integer,false,null,,,null
public,projects_all,recurrence,9,text,false,null,,,null
public,projects_all,metadata,10,jsonb,false,null,,,null
public,projects_home,id,1,uuid,true,gen_random_uuid(),,,null
public,projects_home,external_id,2,text,true,null,,,null
public,projects_home,category,6,text,false,null,,,null
public,projects_home,state,7,text,false,null,,,null
public,projects_home,priority,8,text,false,null,,,null
public,projects_home,order,9,bigint,false,null,,,null
public,projects_home,metadata,10,jsonb,false,null,,,null
public,projects_home,created_at,11,timestamp without time zone,false,now(),,,null
public,projects_home,updated_at,12,timestamp without time zone,false,now(),,,null
public,projects_home,property,13,text,false,null,,,null
public,projects_home,area,14,text,false,null,,,null
public,projects_home,title,15,text,false,null,,,null
public,projects_home,resource_links,16,jsonb,false,null,,,null
public,projects_home,cost,17,numeric,false,null,,,null
public,projects_home,date_completed,18,date,false,null,,,null
public,projects_misc,id,1,uuid,true,gen_random_uuid(),,,null
public,projects_misc,created_at,2,timestamp with time zone,true,now(),,,null
public,projects_misc,external_id,3,text,false,null,,,null
public,projects_misc,category,4,text,false,null,,,null
public,projects_misc,title,5,text,false,null,,,null
public,projects_misc,priority,6,text,false,null,,,null
public,projects_misc,order,7,bigint,false,null,,,null
public,projects_misc,resource_links,8,jsonb,false,null,,,null
public,projects_misc,state,9,text,false,null,,,null
public,projects_misc,updated_at,10,timestamp without time zone,false,now(),,,null
public,projects_misc,metadata,11,jsonb,false,null,,,null
public,projects_repeating,id,1,uuid,true,gen_random_uuid(),,,null
public,projects_repeating,created_at,2,timestamp with time zone,true,now(),,,null
public,projects_repeating,external_id,3,text,false,null,,,null
public,projects_repeating,property,4,text,false,null,,,null
public,projects_repeating,state,5,text,false,null,,,null
public,projects_repeating,category,6,text,false,null,,,null
public,projects_repeating,task_description,7,text,false,null,,,null
public,projects_repeating,recurrence,8,text,false,null,,,null
public,projects_repeating,priority,9,text,false,null,,,null
public,projects_repeating,order,10,bigint,false,null,,,null
public,projects_repeating,updated_at,11,timestamp without time zone,false,now(),,,null
public,projects_repeating,title,12,text,false,null,,,null
public,projects_repeating,metadata,13,jsonb,false,null,,,null
public,projects_vehicle,id,1,uuid,true,gen_random_uuid(),,,null
public,projects_vehicle,created_at,2,timestamp with time zone,true,now(),,,null
public,projects_vehicle,external_id,3,text,false,null,,,null
public,projects_vehicle,vehicle,4,text,false,null,,,null
public,projects_vehicle,state,5,text,false,null,,,null
public,projects_vehicle,category,6,text,false,null,,,null
public,projects_vehicle,date_completed,7,date,false,null,,,null
public,projects_vehicle,hours,8,numeric,false,null,,,null
public,projects_vehicle,mileage,9,numeric,false,null,,,null
public,projects_vehicle,mechanic,10,text,false,null,,,null
public,projects_vehicle,service_description,11,text,false,null,,,null
public,projects_vehicle,resource_links,12,jsonb,false,null,,,null
public,projects_vehicle,order,13,bigint,false,null,,,null
public,projects_vehicle,maintenance_checks,14,jsonb,false,null,,,null
public,projects_vehicle,updated_at,15,timestamp without time zone,false,now(),,,null
public,projects_vehicle,metadata,16,jsonb,false,null,,,null
public,projects_vehicle,title,17,text,false,null,,,null
public,projects_vehicle,priority,18,text,false,null,,,null
public,repeatable_masters,id,1,text,true,null,,,null
public,repeatable_masters,taskId,2,text,false,null,,,null
public,repeatable_masters,projectId,3,text,true,null,,,null
public,repeatable_masters,title,4,text,true,'Untitled Task'::text,,,null
public,repeatable_masters,source,5,text,true,'repeating'::text,,,null
public,repeatable_masters,category,6,text,true,'uncategorized'::text,,,null
public,repeatable_masters,state,7,text,true,'unknown'::text,,,null
public,repeatable_masters,priority,8,integer,false,3,,,null
public,repeatable_masters,order,9,integer,false,null,,,null
public,repeatable_masters,recurrence,10,text,true,'weekly'::text,,,null
public,repeatable_masters,baseDay,11,text,true,''::text,,,null
public,repeatable_masters,monthWeek,12,text,true,''::text,,,null
public,repeatable_masters,baseBucket,13,text,true,''::text,,,null
public,repeatable_masters,startDate,14,text,true,''::text,,,null
public,repeatable_masters,originalStartDate,15,text,true,''::text,,,null
public,repeatable_masters,active,16,boolean,true,true,,,null
public,repeatable_masters,asset,17,text,true,''::text,,,null
public,repeatable_masters,mileage,18,text,true,''::text,,,null
public,repeatable_overrides,id,1,text,true,null,,,null
public,repeatable_overrides,projectId,2,text,true,null,,,null
public,repeatable_overrides,title,3,text,true,'Untitled Task'::text,,,null
public,repeatable_overrides,category,4,text,true,'uncategorized'::text,,,null
public,repeatable_overrides,state,5,text,true,'unknown'::text,,,null
public,repeatable_overrides,priority,6,integer,false,3,,,null
public,repeatable_overrides,order,7,integer,false,null,,,null
public,repeatable_overrides,recurrence,8,text,true,'weekly'::text,,,null
public,repeatable_overrides,baseDay,9,text,true,'Monday'::text,,,null
public,repeatable_overrides,monthWeek,10,text,true,''::text,,,null
public,repeatable_overrides,baseBucket,11,text,true,'Morning'::text,,,null
public,repeatable_overrides,startDate,12,text,true,''::text,,,null
public,repeatable_overrides,originalStartDate,13,text,true,''::text,,,null
public,repeatable_overrides,active,14,boolean,true,true,,,null
public,repeatable_overrides,removedFromPlanner,15,boolean,true,false,,,null
public,repeatable_overrides,removedFromTaskManager,16,boolean,true,false,,,null
public,repeatable_overrides,asset,17,text,true,''::text,,,null
public,repeatable_overrides,mileage,18,text,true,''::text,,,null
public,repeatable_overrides,updatedAt,19,timestamp with time zone,true,CURRENT_TIMESTAMP,,,null
public,staged_queue,profileId,1,text,true,null,,,null
public,staged_queue,id,2,text,true,null,,,null
public,staged_queue,position,3,bigint,true,null,,,null
public,staged_queue,item,4,jsonb,true,null,,,null
public,task_manager,id,1,text,true,null,,,null
public,task_manager,projectId,2,text,true,null,,,null
public,task_manager,title,3,text,true,'Untitled Task'::text,,,null
public,task_manager,source,4,text,true,'unknown'::text,,,null
public,task_manager,category,5,text,true,'uncategorized'::text,,,null
public,task_manager,state,6,text,true,'unknown'::text,,,null
public,task_manager,priority,7,integer,false,3,,,null
public,task_manager,order,8,integer,false,null,,,null
public,task_manager,recurrence,9,text,true,''::text,,,null
public,task_manager,startDate,10,text,true,''::text,,,null
public,task_manager,updatedAt,11,timestamp with time zone,true,CURRENT_TIMESTAMP,,,null
public,task_manager,metadataJson,12,jsonb,true,'{}'::jsonb,,,null
public,trips,id,1,text,true,null,,,null
public,trips,created_at,2,timestamp with time zone,true,now(),,,null
public,trips,destination,3,text,false,null,,,null
public,trips,start_date,4,date,false,null,,,null
public,trips,end_date,5,date,false,null,,,null
public,trips,trip_type,6,text,false,null,,,null
public,trips,status,7,text,false,null,,,null
public,trips,timeline_month,8,smallint,false,null,,,null
public,trips,timeline_year,9,smallint,false,null,,,null
public,trips,notes,10,text,false,null,,,null
public,trips,duration,11,smallint,false,null,,,null
public,trips,seasonality,12,text,false,null,,,null
public,trips,cost_range,13,text,false,null,,,null
public,trips,considerations,14,text,false,null,,,null
public,trips,tags,15,text,false,null,,,null
public,trips,links,16,jsonb,false,null,,,null
public,trips,priority,17,text,false,null,,,null
public,trips,purpose,18,text,false,null,,,null
public,trips,location,19,text,false,null,,,null
public,trips,updated_at,20,timestamp without time zone,false,now(),,,null
public,trips_timeline,created_at,2,timestamp with time zone,true,now(),,,null
public,trips_timeline,year,3,integer,true,null,,,null
public,trips_timeline,month,4,text,true,null,,,null
public,trips_timeline,color,5,text,false,null,,,null
public,trips_timeline,notes,6,text,false,null,,,null
public,trips_timeline,blocks,7,text,false,null,,,null
public,trips_workflow_metadata,id,1,uuid,true,gen_random_uuid(),,,null
public,trips_workflow_metadata,created_at,2,timestamp with time zone,true,now(),,,null
public,trips_workflow_metadata,stage,3,text,false,null,,,null
public,trips_workflow_metadata,stage_notes,4,text,false,null,,,null
public,trips_workflow_metadata,updated_at,5,timestamp without time zone,false,now(),,,null
public,trips_workflow_metadata,trip_id,6,uuid,false,null,,,null
public,weekly_tasks,id,1,text,true,null,,,null
public,weekly_tasks,taskId,2,text,false,null,,,null
public,weekly_tasks,taskType,3,text,true,'curated'::text,,,null
public,weekly_tasks,type,4,text,true,'curated'::text,,,null
public,weekly_tasks,title,5,text,true,'Untitled Task'::text,,,null
public,weekly_tasks,source,6,text,true,'unknown'::text,,,null
public,weekly_tasks,projectId,7,text,true,''::text,,,null
public,weekly_tasks,parentRepeatableId,8,text,true,''::text,,,null
public,weekly_tasks,occurrenceDate,9,text,true,''::text,,,null
public,weekly_tasks,date,10,text,true,''::text,,,null
public,weekly_tasks,timeSlot,11,text,true,'morning'::text,,,null
public,weekly_tasks,bucket,12,text,true,'morning'::text,,,null
public,weekly_tasks,completed,13,boolean,true,false,,,null
public,weekly_tasks,overridden,14,boolean,true,false,,,null
public,weekly_tasks,deletedInstance,15,boolean,true,false,,,null
public,weekly_tasks,checklistJson,16,jsonb,true,'[]'::jsonb,,,null
public,weekly_tasks,checklistOpen,17,boolean,true,false,,,null
public,weekly_tasks,reminderJson,18,jsonb,true,'{}'::jsonb,,,null
public,weekly_tasks,metadataJson,19,jsonb,true,'{}'::jsonb,,,null
public,weekly_tasks,priority,20,integer,false,null,,,null
public,weekly_tasks,recurrence,21,text,true,''::text,,,null
public,weekly_tasks,order,22,integer,false,null,,,null
public,weekly_tasks,updatedAt,23,timestamp with time zone,true,CURRENT_TIMESTAMP,,,null
realtime,messages,topic,1,text,true,null,,,null
realtime,messages,extension,2,text,true,null,,,null
realtime,messages,payload,3,jsonb,false,null,,,null
realtime,messages,event,4,text,false,null,,,null
realtime,messages,private,5,boolean,false,false,,,null
realtime,messages,updated_at,6,timestamp without time zone,true,"timezone('utc'::text, clock_timestamp())",,,null
realtime,messages,inserted_at,7,timestamp without time zone,true,"timezone('utc'::text, clock_timestamp())",,,null
realtime,messages,id,8,uuid,true,gen_random_uuid(),,,null
realtime,messages,binary_payload,9,bytea,false,null,,,null
realtime,messages,skip_broadcast,10,boolean,true,false,,,null
realtime,schema_migrations,version,1,bigint,true,null,,,null
realtime,schema_migrations,inserted_at,2,timestamp(0) without time zone,false,now(),,,null
realtime,subscription,id,1,bigint,true,null,a,,null
realtime,subscription,subscription_id,2,uuid,true,null,,,null
realtime,subscription,entity,3,regclass,true,null,,,null
realtime,subscription,filters,4,realtime.user_defined_filter[],true,'{}'::realtime.user_defined_filter[],,,null
realtime,subscription,claims,5,jsonb,true,null,,,null
realtime,subscription,claims_role,6,regrole,true,realtime.to_regrole((claims ->> 'role'::text)),,s,null
realtime,subscription,created_at,7,timestamp without time zone,true,"timezone('utc'::text, now())",,,null
realtime,subscription,action_filter,8,text,false,'*'::text,,,null
realtime,subscription,selected_columns,9,text[],false,null,,,null
storage,buckets,id,1,text,true,null,,,null
storage,buckets,name,2,text,true,null,,,null
storage,buckets,owner,3,uuid,false,null,,,null
storage,buckets,created_at,4,timestamp with time zone,false,now(),,,null
storage,buckets,updated_at,5,timestamp with time zone,false,now(),,,null
storage,buckets,public,6,boolean,false,false,,,null
storage,buckets,avif_autodetection,7,boolean,false,false,,,null
storage,buckets,file_size_limit,8,bigint,false,null,,,null
storage,buckets,allowed_mime_types,9,text[],false,null,,,null
storage,buckets,owner_id,10,text,false,null,,,null
storage,buckets,type,11,storage.buckettype,true,'STANDARD'::storage.buckettype,,,null
storage,buckets,versioning_status,12,text,true,'DISABLED'::text,,,null
storage,buckets,lifecycle_configuration,13,jsonb,false,null,,,null
storage,buckets,lifecycle_configuration_generation,14,uuid,false,null,,,null
storage,buckets_analytics,name,1,text,true,null,,,null
storage,buckets_analytics,type,2,storage.buckettype,true,'ANALYTICS'::storage.buckettype,,,null
storage,buckets_analytics,format,3,text,true,'ICEBERG'::text,,,null
storage,buckets_analytics,created_at,4,timestamp with time zone,true,now(),,,null
storage,buckets_analytics,updated_at,5,timestamp with time zone,true,now(),,,null
storage,buckets_analytics,id,6,uuid,true,gen_random_uuid(),,,null
storage,buckets_analytics,deleted_at,7,timestamp with time zone,false,null,,,null
storage,buckets_vectors,id,1,text,true,null,,,null
storage,buckets_vectors,type,2,storage.buckettype,true,'VECTOR'::storage.buckettype,,,null
storage,buckets_vectors,created_at,3,timestamp with time zone,true,now(),,,null
storage,buckets_vectors,updated_at,4,timestamp with time zone,true,now(),,,null
storage,migrations,id,1,integer,true,null,,,null
storage,migrations,name,2,character varying(100),true,null,,,null
storage,migrations,hash,3,character varying(40),true,null,,,null
storage,migrations,executed_at,4,timestamp without time zone,false,CURRENT_TIMESTAMP,,,null
storage,objects,id,1,uuid,true,gen_random_uuid(),,,null
storage,objects,bucket_id,2,text,false,null,,,null
storage,objects,name,3,text,false,null,,,null
storage,objects,owner,4,uuid,false,null,,,null
storage,objects,created_at,5,timestamp with time zone,false,now(),,,null
storage,objects,updated_at,6,timestamp with time zone,false,now(),,,null
storage,objects,last_accessed_at,7,timestamp with time zone,false,now(),,,null
storage,objects,metadata,8,jsonb,false,null,,,null
storage,objects,path_tokens,9,text[],false,"string_to_array(name, '/'::text)",,s,null
storage,objects,version,10,text,false,null,,,null
storage,objects,owner_id,11,text,false,null,,,null
storage,objects,user_metadata,12,jsonb,false,null,,,null
storage,objects,archived_at,13,timestamp with time zone,false,null,,,null
storage,objects,is_delete_marker,14,boolean,true,false,,,null
storage,objects,is_versioned,15,boolean,true,false,,,null
storage,s3_multipart_uploads,id,1,text,true,null,,,null
storage,s3_multipart_uploads,in_progress_size,2,bigint,true,0,,,null
storage,s3_multipart_uploads,upload_signature,3,text,true,null,,,null
storage,s3_multipart_uploads,bucket_id,4,text,true,null,,,null
storage,s3_multipart_uploads,key,5,text,true,null,,,null
storage,s3_multipart_uploads,version,6,text,true,null,,,null
storage,s3_multipart_uploads,owner_id,7,text,false,null,,,null
storage,s3_multipart_uploads,created_at,8,timestamp with time zone,true,now(),,,null
storage,s3_multipart_uploads,user_metadata,9,jsonb,false,null,,,null
storage,s3_multipart_uploads,metadata,10,jsonb,false,null,,,null
storage,s3_multipart_uploads_parts,id,1,uuid,true,gen_random_uuid(),,,null
storage,s3_multipart_uploads_parts,upload_id,2,text,true,null,,,null
storage,s3_multipart_uploads_parts,size,3,bigint,true,0,,,null
storage,s3_multipart_uploads_parts,part_number,4,integer,true,null,,,null
storage,s3_multipart_uploads_parts,bucket_id,5,text,true,null,,,null
storage,s3_multipart_uploads_parts,key,6,text,true,null,,,null
storage,s3_multipart_uploads_parts,etag,7,text,true,null,,,null
storage,s3_multipart_uploads_parts,owner_id,8,text,false,null,,,null
storage,s3_multipart_uploads_parts,version,9,text,true,null,,,null
storage,s3_multipart_uploads_parts,created_at,10,timestamp with time zone,true,now(),,,null
storage,vector_indexes,id,1,text,true,gen_random_uuid(),,,null
storage,vector_indexes,name,2,text,true,null,,,null
storage,vector_indexes,bucket_id,3,text,true,null,,,null
storage,vector_indexes,data_type,4,text,true,null,,,null
storage,vector_indexes,dimension,5,integer,true,null,,,null
storage,vector_indexes,distance_metric,6,text,true,null,,,null
storage,vector_indexes,metadata_configuration,7,jsonb,false,null,,,null
storage,vector_indexes,created_at,8,timestamp with time zone,true,now(),,,null
storage,vector_indexes,updated_at,9,timestamp with time zone,true,now(),,,null
vault,decrypted_secrets,id,1,uuid,false,null,,,null
vault,decrypted_secrets,name,2,text,false,null,,,null
vault,decrypted_secrets,description,3,text,false,null,,,null
vault,decrypted_secrets,secret,4,text,false,null,,,null
vault,decrypted_secrets,decrypted_secret,5,text,false,null,,,null
vault,decrypted_secrets,key_id,6,uuid,false,null,,,null
vault,decrypted_secrets,nonce,7,bytea,false,null,,,null
vault,decrypted_secrets,created_at,8,timestamp with time zone,false,null,,,null
vault,decrypted_secrets,updated_at,9,timestamp with time zone,false,null,,,null
vault,secrets,id,1,uuid,true,gen_random_uuid(),,,null
vault,secrets,name,2,text,false,null,,,null
vault,secrets,description,3,text,true,''::text,,,null
vault,secrets,secret,4,text,true,null,,,null
vault,secrets,key_id,5,uuid,false,null,,,null
vault,secrets,nonce,6,bytea,false,vault._crypto_aead_det_noncegen(),,,null
vault,secrets,created_at,7,timestamp with time zone,true,CURRENT_TIMESTAMP,,,null
vault,secrets,updated_at,8,timestamp with time zone,true,CURRENT_TIMESTAMP,,,null