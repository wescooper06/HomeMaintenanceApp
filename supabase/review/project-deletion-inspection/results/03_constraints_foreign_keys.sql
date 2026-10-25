schema_name,constraint_name,relation,referenced_relation,contype,convalidated,condeferrable,condeferred,on_delete_code,on_update_code,definition
auth,audit_log_entries_pkey,auth.audit_log_entries,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,custom_oauth_providers_authorization_url_https,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (authorization_url IS NULL OR authorization_url ~~ 'https://%'::text)
auth,custom_oauth_providers_authorization_url_length,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (authorization_url IS NULL OR char_length(authorization_url) <= 2048)
auth,custom_oauth_providers_client_id_length,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (char_length(client_id) >= 1 AND char_length(client_id) <= 512)
auth,custom_oauth_providers_discovery_url_length,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (discovery_url IS NULL OR char_length(discovery_url) <= 2048)
auth,custom_oauth_providers_identifier_format,auth.custom_oauth_providers,-,c,true,false,false," "," ","CHECK (identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)"
auth,custom_oauth_providers_identifier_key,auth.custom_oauth_providers,-,u,true,false,false," "," ",UNIQUE (identifier)
auth,custom_oauth_providers_issuer_length,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (issuer IS NULL OR char_length(issuer) >= 1 AND char_length(issuer) <= 2048)
auth,custom_oauth_providers_jwks_uri_https,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (jwks_uri IS NULL OR jwks_uri ~~ 'https://%'::text)
auth,custom_oauth_providers_jwks_uri_length,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (jwks_uri IS NULL OR char_length(jwks_uri) <= 2048)
auth,custom_oauth_providers_name_length,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (char_length(name) >= 1 AND char_length(name) <= 100)
auth,custom_oauth_providers_oauth2_requires_endpoints,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (provider_type <> 'oauth2'::text OR authorization_url IS NOT NULL AND token_url IS NOT NULL AND userinfo_url IS NOT NULL)
auth,custom_oauth_providers_oidc_discovery_url_https,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (provider_type <> 'oidc'::text OR discovery_url IS NULL OR discovery_url ~~ 'https://%'::text)
auth,custom_oauth_providers_oidc_issuer_https,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (provider_type <> 'oidc'::text OR issuer IS NULL OR issuer ~~ 'https://%'::text)
auth,custom_oauth_providers_oidc_requires_issuer,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (provider_type <> 'oidc'::text OR issuer IS NOT NULL)
auth,custom_oauth_providers_pkey,auth.custom_oauth_providers,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,custom_oauth_providers_provider_type_check,auth.custom_oauth_providers,-,c,true,false,false," "," ","CHECK (provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))"
auth,custom_oauth_providers_token_url_https,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (token_url IS NULL OR token_url ~~ 'https://%'::text)
auth,custom_oauth_providers_token_url_length,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (token_url IS NULL OR char_length(token_url) <= 2048)
auth,custom_oauth_providers_userinfo_url_https,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (userinfo_url IS NULL OR userinfo_url ~~ 'https://%'::text)
auth,custom_oauth_providers_userinfo_url_length,auth.custom_oauth_providers,-,c,true,false,false," "," ",CHECK (userinfo_url IS NULL OR char_length(userinfo_url) <= 2048)
auth,flow_state_pkey,auth.flow_state,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,identities_pkey,auth.identities,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,identities_provider_id_provider_unique,auth.identities,-,u,true,false,false," "," ","UNIQUE (provider_id, provider)"
auth,identities_user_id_fkey,auth.identities,auth.users,f,true,false,false,c,a,FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
auth,instances_pkey,auth.instances,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,amr_id_pk,auth.mfa_amr_claims,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,mfa_amr_claims_session_id_authentication_method_pkey,auth.mfa_amr_claims,-,u,true,false,false," "," ","UNIQUE (session_id, authentication_method)"
auth,mfa_amr_claims_session_id_fkey,auth.mfa_amr_claims,auth.sessions,f,true,false,false,c,a,FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE
auth,mfa_challenges_auth_factor_id_fkey,auth.mfa_challenges,auth.mfa_factors,f,true,false,false,c,a,FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE
auth,mfa_challenges_pkey,auth.mfa_challenges,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,mfa_factors_last_challenged_at_key,auth.mfa_factors,-,u,true,false,false," "," ",UNIQUE (last_challenged_at)
auth,mfa_factors_pkey,auth.mfa_factors,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,mfa_factors_user_id_fkey,auth.mfa_factors,auth.users,f,true,false,false,c,a,FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
auth,mfa_recovery_code_sets_failed_verification_count_check,auth.mfa_recovery_code_sets,-,c,true,false,false," "," ",CHECK (failed_verification_count >= 0)
auth,mfa_recovery_code_sets_mfa_factor_id_fkey,auth.mfa_recovery_code_sets,auth.mfa_factors,f,true,false,false,c,a,FOREIGN KEY (mfa_factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE
auth,mfa_recovery_code_sets_mfa_factor_id_key,auth.mfa_recovery_code_sets,-,u,true,false,false," "," ",UNIQUE (mfa_factor_id)
auth,mfa_recovery_code_sets_pkey,auth.mfa_recovery_code_sets,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,mfa_recovery_code_sets_user_id_fkey,auth.mfa_recovery_code_sets,auth.users,f,true,false,false,c,a,FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
auth,mfa_recovery_code_sets_user_id_key,auth.mfa_recovery_code_sets,-,u,true,false,false," "," ",UNIQUE (user_id)
auth,mfa_recovery_codes_mfa_recovery_code_set_id_fkey,auth.mfa_recovery_codes,auth.mfa_recovery_code_sets,f,true,false,false,c,a,FOREIGN KEY (mfa_recovery_code_set_id) REFERENCES auth.mfa_recovery_code_sets(id) ON DELETE CASCADE
auth,mfa_recovery_codes_pkey,auth.mfa_recovery_codes,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,oauth_authorizations_authorization_code_key,auth.oauth_authorizations,-,u,true,false,false," "," ",UNIQUE (authorization_code)
auth,oauth_authorizations_authorization_code_length,auth.oauth_authorizations,-,c,true,false,false," "," ",CHECK (char_length(authorization_code) <= 255)
auth,oauth_authorizations_authorization_id_key,auth.oauth_authorizations,-,u,true,false,false," "," ",UNIQUE (authorization_id)
auth,oauth_authorizations_client_id_fkey,auth.oauth_authorizations,auth.oauth_clients,f,true,false,false,c,a,FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE
auth,oauth_authorizations_code_challenge_length,auth.oauth_authorizations,-,c,true,false,false," "," ",CHECK (char_length(code_challenge) <= 128)
auth,oauth_authorizations_expires_at_future,auth.oauth_authorizations,-,c,true,false,false," "," ",CHECK (expires_at > created_at)
auth,oauth_authorizations_nonce_length,auth.oauth_authorizations,-,c,true,false,false," "," ",CHECK (char_length(nonce) <= 255)
auth,oauth_authorizations_pkey,auth.oauth_authorizations,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,oauth_authorizations_redirect_uri_length,auth.oauth_authorizations,-,c,true,false,false," "," ",CHECK (char_length(redirect_uri) <= 2048)
auth,oauth_authorizations_resource_length,auth.oauth_authorizations,-,c,true,false,false," "," ",CHECK (char_length(resource) <= 2048)
auth,oauth_authorizations_scope_length,auth.oauth_authorizations,-,c,true,false,false," "," ",CHECK (char_length(scope) <= 4096)
auth,oauth_authorizations_state_length,auth.oauth_authorizations,-,c,true,false,false," "," ",CHECK (char_length(state) <= 4096)
auth,oauth_authorizations_user_id_fkey,auth.oauth_authorizations,auth.users,f,true,false,false,c,a,FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
auth,oauth_client_states_pkey,auth.oauth_client_states,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,oauth_clients_client_name_length,auth.oauth_clients,-,c,true,false,false," "," ",CHECK (char_length(client_name) <= 1024)
auth,oauth_clients_client_uri_length,auth.oauth_clients,-,c,true,false,false," "," ",CHECK (char_length(client_uri) <= 2048)
auth,oauth_clients_logo_uri_length,auth.oauth_clients,-,c,true,false,false," "," ",CHECK (char_length(logo_uri) <= 2048)
auth,oauth_clients_pkey,auth.oauth_clients,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,oauth_clients_token_endpoint_auth_method_check,auth.oauth_clients,-,c,true,false,false," "," ","CHECK (token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text]))"
auth,oauth_consents_client_id_fkey,auth.oauth_consents,auth.oauth_clients,f,true,false,false,c,a,FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE
auth,oauth_consents_pkey,auth.oauth_consents,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,oauth_consents_revoked_after_granted,auth.oauth_consents,-,c,true,false,false," "," ",CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
auth,oauth_consents_scopes_length,auth.oauth_consents,-,c,true,false,false," "," ",CHECK (char_length(scopes) <= 2048)
auth,oauth_consents_scopes_not_empty,auth.oauth_consents,-,c,true,false,false," "," ",CHECK (char_length(TRIM(BOTH FROM scopes)) > 0)
auth,oauth_consents_user_client_unique,auth.oauth_consents,-,u,true,false,false," "," ","UNIQUE (user_id, client_id)"
auth,oauth_consents_user_id_fkey,auth.oauth_consents,auth.users,f,true,false,false,c,a,FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
auth,one_time_tokens_pkey,auth.one_time_tokens,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,one_time_tokens_token_hash_check,auth.one_time_tokens,-,c,true,false,false," "," ",CHECK (char_length(token_hash) > 0)
auth,one_time_tokens_user_id_fkey,auth.one_time_tokens,auth.users,f,true,false,false,c,a,FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
auth,refresh_tokens_pkey,auth.refresh_tokens,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,refresh_tokens_session_id_fkey,auth.refresh_tokens,auth.sessions,f,true,false,false,c,a,FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE
auth,refresh_tokens_token_unique,auth.refresh_tokens,-,u,true,false,false," "," ",UNIQUE (token)
auth,entity_id not empty,auth.saml_providers,-,c,true,false,false," "," ",CHECK (char_length(entity_id) > 0)
auth,metadata_url not empty,auth.saml_providers,-,c,true,false,false," "," ",CHECK (metadata_url = NULL::text OR char_length(metadata_url) > 0)
auth,metadata_xml not empty,auth.saml_providers,-,c,true,false,false," "," ",CHECK (char_length(metadata_xml) > 0)
auth,saml_providers_entity_id_key,auth.saml_providers,-,u,true,false,false," "," ",UNIQUE (entity_id)
auth,saml_providers_pkey,auth.saml_providers,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,saml_providers_sso_provider_id_fkey,auth.saml_providers,auth.sso_providers,f,true,false,false,c,a,FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE
auth,request_id not empty,auth.saml_relay_states,-,c,true,false,false," "," ",CHECK (char_length(request_id) > 0)
auth,saml_relay_states_flow_state_id_fkey,auth.saml_relay_states,auth.flow_state,f,true,false,false,c,a,FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE
auth,saml_relay_states_pkey,auth.saml_relay_states,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,saml_relay_states_sso_provider_id_fkey,auth.saml_relay_states,auth.sso_providers,f,true,false,false,c,a,FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE
auth,schema_migrations_pkey,auth.schema_migrations,-,p,true,false,false," "," ",PRIMARY KEY (version)
auth,scim_tokens_expires_at_future,auth.scim_tokens,-,c,true,false,false," "," ",CHECK (expires_at IS NULL OR expires_at > created_at)
auth,scim_tokens_pkey,auth.scim_tokens,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,scim_tokens_revoked_after_created,auth.scim_tokens,-,c,true,false,false," "," ",CHECK (revoked_at IS NULL OR revoked_at >= created_at)
auth,scim_tokens_sso_provider_id_fkey,auth.scim_tokens,auth.sso_providers,f,true,false,false,c,a,FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE
auth,scim_tokens_token_hash_check,auth.scim_tokens,-,c,true,false,false," "," ",CHECK (token_hash ~ '^[0-9a-f]{64}$'::text)
auth,scim_users_pkey,auth.scim_users,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,scim_users_sso_provider_id_fkey,auth.scim_users,auth.sso_providers,f,true,false,false,c,a,FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE
auth,scim_users_user_id_fkey,auth.scim_users,auth.users,f,true,false,false,n,a,FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
auth,sessions_oauth_client_id_fkey,auth.sessions,auth.oauth_clients,f,true,false,false,c,a,FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE
auth,sessions_pkey,auth.sessions,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,sessions_scopes_length,auth.sessions,-,c,true,false,false," "," ",CHECK (char_length(scopes) <= 4096)
auth,sessions_user_id_fkey,auth.sessions,auth.users,f,true,false,false,c,a,FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
auth,domain not empty,auth.sso_domains,-,c,true,false,false," "," ",CHECK (char_length(domain) > 0)
auth,sso_domains_pkey,auth.sso_domains,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,sso_domains_sso_provider_id_fkey,auth.sso_domains,auth.sso_providers,f,true,false,false,c,a,FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE
auth,resource_id not empty,auth.sso_providers,-,c,true,false,false," "," ",CHECK (resource_id = NULL::text OR char_length(resource_id) > 0)
auth,sso_providers_pkey,auth.sso_providers,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,users_email_change_confirm_status_check,auth.users,-,c,true,false,false," "," ",CHECK (email_change_confirm_status >= 0 AND email_change_confirm_status <= 2)
auth,users_phone_key,auth.users,-,u,true,false,false," "," ",UNIQUE (phone)
auth,users_pkey,auth.users,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,webauthn_challenges_challenge_type_check,auth.webauthn_challenges,-,c,true,false,false," "," ","CHECK (challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text]))"
auth,webauthn_challenges_pkey,auth.webauthn_challenges,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,webauthn_challenges_user_id_fkey,auth.webauthn_challenges,auth.users,f,true,false,false,c,a,FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
auth,webauthn_credentials_pkey,auth.webauthn_credentials,-,p,true,false,false," "," ",PRIMARY KEY (id)
auth,webauthn_credentials_user_id_fkey,auth.webauthn_credentials,auth.users,f,true,false,false,c,a,FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
public,activity_types_pkey,activity_types,-,p,true,false,false," "," ",PRIMARY KEY (id)
public,curated_queue_check,curated_queue,-,c,true,false,false," "," ","CHECK ((item ->> 'taskId'::text) = ""taskId"")"
public,curated_queue_item_check,curated_queue,-,c,true,false,false," "," ",CHECK (jsonb_typeof(item) = 'object'::text)
public,curated_queue_pkey,curated_queue,-,p,true,false,false," "," ","PRIMARY KEY (""profileId"", ""taskId"")"
public,curated_queue_profileId_fkey,curated_queue,planner_profiles,f,true,false,false,a,a,"FOREIGN KEY (""profileId"") REFERENCES planner_profiles(id)"
public,parking_lot_checklistJson_check,parking_lot,-,c,true,false,false," "," ","CHECK (jsonb_typeof(""checklistJson"") = 'array'::text)"
public,parking_lot_convertedTo_check,parking_lot,-,c,true,false,false," "," ","CHECK (""convertedTo"" IS NULL OR jsonb_typeof(""convertedTo"") = 'object'::text)"
public,parking_lot_metadataJson_check,parking_lot,-,c,true,false,false," "," ","CHECK (jsonb_typeof(""metadataJson"") = 'object'::text)"
public,parking_lot_pkey,parking_lot,-,p,true,false,false," "," ","PRIMARY KEY (""profileId"", id)"
public,parking_lot_profileId_fkey,parking_lot,planner_profiles,f,true,false,false,a,a,"FOREIGN KEY (""profileId"") REFERENCES planner_profiles(id)"
public,parking_lot_reminderJson_check,parking_lot,-,c,true,false,false," "," ","CHECK (jsonb_typeof(""reminderJson"") = 'object'::text)"
public,planner_parking_lot_pkey,planner_parking_lot,-,p,true,false,false," "," ",PRIMARY KEY (id)
public,planner_profiles_pkey,planner_profiles,-,p,true,false,false," "," ",PRIMARY KEY (id)
public,planner_profiles_weekStartDate_check,planner_profiles,-,c,true,false,false," "," ","CHECK (""weekStartDate"" = ''::text OR ""weekStartDate"" ~ '^\d{4}-\d{2}-\d{2}$'::text)"
public,planner_tasks_pkey,planner_tasks,-,p,true,false,false," "," ",PRIMARY KEY (id)
public,planner_weekly_tasks_pkey,planner_weekly_tasks,-,p,true,false,false," "," ",PRIMARY KEY (id)
public,project_registry_pkey,project_registry,-,p,true,false,false," "," ",PRIMARY KEY (id)
public,projects_pkey1,projects,-,p,true,false,false," "," ","PRIMARY KEY (id, source)"
public,projects_home_external_id_unique,projects_home,-,u,true,false,false," "," ",UNIQUE (external_id)
public,projects_pkey,projects_home,-,p,true,false,false," "," ",PRIMARY KEY (id)
public,projects_misc_external_id_unique,projects_misc,-,u,true,false,false," "," ",UNIQUE (external_id)
public,projects_misc_pkey,projects_misc,-,p,true,false,false," "," ",PRIMARY KEY (id)
public,projects_repeating_external_id_unique,projects_repeating,-,u,true,false,false," "," ",UNIQUE (external_id)
public,projects_repeating_pkey,projects_repeating,-,p,true,false,false," "," ",PRIMARY KEY (id)
public,project_vehicle_pkey,projects_vehicle,-,p,true,false,false," "," ",PRIMARY KEY (id)
public,projects_vehicle_external_id_unique,projects_vehicle,-,u,true,false,false," "," ",UNIQUE (external_id)
public,repeatable_masters_pkey,repeatable_masters,-,p,true,false,false," "," ",PRIMARY KEY (id)
public,repeatable_overrides_pkey,repeatable_overrides,-,p,true,false,false," "," ",PRIMARY KEY (id)
public,repeatable_overrides_projectId_key,repeatable_overrides,-,u,true,false,false," "," ","UNIQUE (""projectId"")"
public,staged_queue_item_check,staged_queue,-,c,true,false,false," "," ",CHECK (jsonb_typeof(item) = 'object'::text)
public,staged_queue_pkey,staged_queue,-,p,true,false,false," "," ","PRIMARY KEY (""profileId"", id)"
public,staged_queue_profileId_fkey,staged_queue,planner_profiles,f,true,false,false,a,a,"FOREIGN KEY (""profileId"") REFERENCES planner_profiles(id)"
public,task_manager_pkey,task_manager,-,p,true,false,false," "," ",PRIMARY KEY (id)
public,trips_pkey,trips,-,p,true,false,false," "," ",PRIMARY KEY (id)
public,trip_timeline_pkey,trips_timeline,-,p,true,false,false," "," ","PRIMARY KEY (year, month)"
public,trips_workflow_metadata_pkey,trips_workflow_metadata,-,p,true,false,false," "," ",PRIMARY KEY (id)
public,weekly_tasks_pkey,weekly_tasks,-,p,true,false,false," "," ",PRIMARY KEY (id)
realtime,messages_payload_exclusive,realtime.messages,-,c,false,false,false," "," ",CHECK (payload IS NULL OR binary_payload IS NULL) NOT VALID
realtime,messages_pkey,realtime.messages,-,p,true,false,false," "," ","PRIMARY KEY (id, inserted_at)"
realtime,schema_migrations_pkey,realtime.schema_migrations,-,p,true,false,false," "," ",PRIMARY KEY (version)
realtime,pk_subscription,realtime.subscription,-,p,true,false,false," "," ",PRIMARY KEY (id)
realtime,subscription_action_filter_check,realtime.subscription,-,c,true,false,false," "," ","CHECK (action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text]))"
storage,buckets_lifecycle_configuration_pair_check,storage.buckets,-,c,true,false,false," "," ",CHECK ((lifecycle_configuration IS NULL) = (lifecycle_configuration_generation IS NULL))
storage,buckets_lifecycle_configuration_shape_check,storage.buckets,-,c,true,false,false," "," ","CHECK (lifecycle_configuration IS NULL OR jsonb_typeof(lifecycle_configuration) = 'object'::text AND lifecycle_configuration ? 'rules'::text AND
CASE
    WHEN jsonb_typeof(lifecycle_configuration -> 'rules'::text) = 'array'::text THEN jsonb_array_length(lifecycle_configuration -> 'rules'::text) >= 1 AND jsonb_array_length(lifecycle_configuration -> 'rules'::text) <= 1000
    ELSE false
END)"
storage,buckets_lifecycle_configuration_standard_only_check,storage.buckets,-,c,true,false,false," "," ",CHECK (type = 'STANDARD'::storage.buckettype OR lifecycle_configuration IS NULL AND lifecycle_configuration_generation IS NULL)
storage,buckets_pkey,storage.buckets,-,p,true,false,false," "," ",PRIMARY KEY (id)
storage,buckets_versioning_dark_check,storage.buckets,-,c,true,false,false," "," ",CHECK (versioning_status = 'DISABLED'::text)
storage,buckets_versioning_standard_only_check,storage.buckets,-,c,true,false,false," "," ",CHECK (type = 'STANDARD'::storage.buckettype OR versioning_status = 'DISABLED'::text)
storage,buckets_versioning_status_check,storage.buckets,-,c,true,false,false," "," ","CHECK (versioning_status = ANY (ARRAY['DISABLED'::text, 'ENABLED'::text, 'SUSPENDED'::text]))"
storage,buckets_analytics_pkey,storage.buckets_analytics,-,p,true,false,false," "," ",PRIMARY KEY (id)
storage,buckets_vectors_pkey,storage.buckets_vectors,-,p,true,false,false," "," ",PRIMARY KEY (id)
storage,migrations_name_key,storage.migrations,-,u,true,false,false," "," ",UNIQUE (name)
storage,migrations_pkey,storage.migrations,-,p,true,false,false," "," ",PRIMARY KEY (id)
storage,objects_bucketId_fkey,storage.objects,storage.buckets,f,true,false,false,a,a,FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id)
storage,objects_pkey,storage.objects,-,p,true,false,false," "," ",PRIMARY KEY (id)
storage,s3_multipart_uploads_bucket_id_fkey,storage.s3_multipart_uploads,storage.buckets,f,true,false,false,a,a,FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id)
storage,s3_multipart_uploads_pkey,storage.s3_multipart_uploads,-,p,true,false,false," "," ",PRIMARY KEY (id)
storage,s3_multipart_uploads_parts_bucket_id_fkey,storage.s3_multipart_uploads_parts,storage.buckets,f,true,false,false,a,a,FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id)
storage,s3_multipart_uploads_parts_pkey,storage.s3_multipart_uploads_parts,-,p,true,false,false," "," ",PRIMARY KEY (id)
storage,s3_multipart_uploads_parts_upload_id_fkey,storage.s3_multipart_uploads_parts,storage.s3_multipart_uploads,f,true,false,false,c,a,FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE
storage,vector_indexes_bucket_id_fkey,storage.vector_indexes,storage.buckets_vectors,f,true,false,false,a,a,FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id)
storage,vector_indexes_pkey,storage.vector_indexes,-,p,true,false,false," "," ",PRIMARY KEY (id)
vault,secrets_pkey,vault.secrets,-,p,true,false,false," "," ",PRIMARY KEY (id)