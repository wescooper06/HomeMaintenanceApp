schema_name,relation_name,index_name,indisvalid,indisready,indisunique,indisprimary,indexed_attribute_numbers,definition,predicate
auth,audit_log_entries,auth.audit_log_entries_pkey,true,true,true,true,2,CREATE UNIQUE INDEX audit_log_entries_pkey ON auth.audit_log_entries USING btree (id),null
auth,audit_log_entries,auth.audit_logs_instance_id_idx,true,true,false,false,1,CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id),null
auth,custom_oauth_providers,auth.custom_oauth_providers_created_at_idx,true,true,false,false,23,CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at),null
auth,custom_oauth_providers,auth.custom_oauth_providers_enabled_idx,true,true,false,false,12,CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled),null
auth,custom_oauth_providers,auth.custom_oauth_providers_identifier_idx,true,true,false,false,3,CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier),null
auth,custom_oauth_providers,auth.custom_oauth_providers_identifier_key,true,true,true,false,3,CREATE UNIQUE INDEX custom_oauth_providers_identifier_key ON auth.custom_oauth_providers USING btree (identifier),null
auth,custom_oauth_providers,auth.custom_oauth_providers_pkey,true,true,true,true,1,CREATE UNIQUE INDEX custom_oauth_providers_pkey ON auth.custom_oauth_providers USING btree (id),null
auth,custom_oauth_providers,auth.custom_oauth_providers_provider_type_idx,true,true,false,false,2,CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type),null
auth,flow_state,auth.flow_state_created_at_idx,true,true,false,false,9,CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC),null
auth,flow_state,auth.flow_state_pkey,true,true,true,true,1,CREATE UNIQUE INDEX flow_state_pkey ON auth.flow_state USING btree (id),null
auth,flow_state,auth.idx_auth_code,true,true,false,false,3,CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code),null
auth,flow_state,auth.idx_user_id_auth_method,true,true,false,false,2 11,"CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method)",null
auth,identities,auth.identities_email_idx,true,true,false,false,8,CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops),null
auth,identities,auth.identities_pkey,true,true,true,true,9,CREATE UNIQUE INDEX identities_pkey ON auth.identities USING btree (id),null
auth,identities,auth.identities_provider_id_provider_unique,true,true,true,false,1 4,"CREATE UNIQUE INDEX identities_provider_id_provider_unique ON auth.identities USING btree (provider_id, provider)",null
auth,identities,auth.identities_user_id_idx,true,true,false,false,2,CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id),null
auth,instances,auth.instances_pkey,true,true,true,true,1,CREATE UNIQUE INDEX instances_pkey ON auth.instances USING btree (id),null
auth,mfa_amr_claims,auth.amr_id_pk,true,true,true,true,5,CREATE UNIQUE INDEX amr_id_pk ON auth.mfa_amr_claims USING btree (id),null
auth,mfa_amr_claims,auth.mfa_amr_claims_session_id_authentication_method_pkey,true,true,true,false,1 4,"CREATE UNIQUE INDEX mfa_amr_claims_session_id_authentication_method_pkey ON auth.mfa_amr_claims USING btree (session_id, authentication_method)",null
auth,mfa_challenges,auth.mfa_challenge_created_at_idx,true,true,false,false,3,CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC),null
auth,mfa_challenges,auth.mfa_challenges_pkey,true,true,true,true,1,CREATE UNIQUE INDEX mfa_challenges_pkey ON auth.mfa_challenges USING btree (id),null
auth,mfa_factors,auth.factor_id_created_at_idx,true,true,false,false,2 6,"CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at)",null
auth,mfa_factors,auth.mfa_factors_last_challenged_at_key,true,true,true,false,10,CREATE UNIQUE INDEX mfa_factors_last_challenged_at_key ON auth.mfa_factors USING btree (last_challenged_at),null
auth,mfa_factors,auth.mfa_factors_pkey,true,true,true,true,1,CREATE UNIQUE INDEX mfa_factors_pkey ON auth.mfa_factors USING btree (id),null
auth,mfa_factors,auth.mfa_factors_user_friendly_name_unique,true,true,true,false,3 2,"CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text)",(TRIM(BOTH FROM friendly_name) <> ''::text)
auth,mfa_factors,auth.mfa_factors_user_id_idx,true,true,false,false,2,CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id),null
auth,mfa_factors,auth.unique_phone_factor_per_user,true,true,true,false,2 9,"CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone)",null
auth,mfa_recovery_code_sets,auth.mfa_recovery_code_sets_mfa_factor_id_key,true,true,true,false,3,CREATE UNIQUE INDEX mfa_recovery_code_sets_mfa_factor_id_key ON auth.mfa_recovery_code_sets USING btree (mfa_factor_id),null
auth,mfa_recovery_code_sets,auth.mfa_recovery_code_sets_pkey,true,true,true,true,1,CREATE UNIQUE INDEX mfa_recovery_code_sets_pkey ON auth.mfa_recovery_code_sets USING btree (id),null
auth,mfa_recovery_code_sets,auth.mfa_recovery_code_sets_user_id_key,true,true,true,false,2,CREATE UNIQUE INDEX mfa_recovery_code_sets_user_id_key ON auth.mfa_recovery_code_sets USING btree (user_id),null
auth,mfa_recovery_codes,auth.mfa_recovery_codes_pkey,true,true,true,true,1,CREATE UNIQUE INDEX mfa_recovery_codes_pkey ON auth.mfa_recovery_codes USING btree (id),null
auth,mfa_recovery_codes,auth.mfa_recovery_codes_set_id_idx,true,true,false,false,2,CREATE INDEX mfa_recovery_codes_set_id_idx ON auth.mfa_recovery_codes USING btree (mfa_recovery_code_set_id),null
auth,oauth_authorizations,auth.oauth_auth_pending_exp_idx,true,true,false,false,15,CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status),(status = 'pending'::auth.oauth_authorization_status)
auth,oauth_authorizations,auth.oauth_authorizations_authorization_code_key,true,true,true,false,13,CREATE UNIQUE INDEX oauth_authorizations_authorization_code_key ON auth.oauth_authorizations USING btree (authorization_code),null
auth,oauth_authorizations,auth.oauth_authorizations_authorization_id_key,true,true,true,false,2,CREATE UNIQUE INDEX oauth_authorizations_authorization_id_key ON auth.oauth_authorizations USING btree (authorization_id),null
auth,oauth_authorizations,auth.oauth_authorizations_pkey,true,true,true,true,1,CREATE UNIQUE INDEX oauth_authorizations_pkey ON auth.oauth_authorizations USING btree (id),null
auth,oauth_client_states,auth.idx_oauth_client_states_created_at,true,true,false,false,4,CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at),null
auth,oauth_client_states,auth.oauth_client_states_pkey,true,true,true,true,1,CREATE UNIQUE INDEX oauth_client_states_pkey ON auth.oauth_client_states USING btree (id),null
auth,oauth_clients,auth.oauth_clients_deleted_at_idx,true,true,false,false,12,CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at),null
auth,oauth_clients,auth.oauth_clients_pkey,true,true,true,true,1,CREATE UNIQUE INDEX oauth_clients_pkey ON auth.oauth_clients USING btree (id),null
auth,oauth_consents,auth.oauth_consents_active_client_idx,true,true,false,false,3,CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL),(revoked_at IS NULL)
auth,oauth_consents,auth.oauth_consents_active_user_client_idx,true,true,false,false,2 3,"CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL)",(revoked_at IS NULL)
auth,oauth_consents,auth.oauth_consents_pkey,true,true,true,true,1,CREATE UNIQUE INDEX oauth_consents_pkey ON auth.oauth_consents USING btree (id),null
auth,oauth_consents,auth.oauth_consents_user_client_unique,true,true,true,false,2 3,"CREATE UNIQUE INDEX oauth_consents_user_client_unique ON auth.oauth_consents USING btree (user_id, client_id)",null
auth,oauth_consents,auth.oauth_consents_user_order_idx,true,true,false,false,2 5,"CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC)",null
auth,one_time_tokens,auth.one_time_tokens_pkey,true,true,true,true,1,CREATE UNIQUE INDEX one_time_tokens_pkey ON auth.one_time_tokens USING btree (id),null
auth,one_time_tokens,auth.one_time_tokens_relates_to_hash_idx,true,true,false,false,5,CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to),null
auth,one_time_tokens,auth.one_time_tokens_token_hash_hash_idx,true,true,false,false,4,CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash),null
auth,one_time_tokens,auth.one_time_tokens_user_id_token_type_key,true,true,true,false,2 3,"CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type)",null
auth,refresh_tokens,auth.refresh_tokens_instance_id_idx,true,true,false,false,1,CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id),null
auth,refresh_tokens,auth.refresh_tokens_instance_id_user_id_idx,true,true,false,false,1 4,"CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id)",null
auth,refresh_tokens,auth.refresh_tokens_parent_idx,true,true,false,false,8,CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent),null
auth,refresh_tokens,auth.refresh_tokens_pkey,true,true,true,true,2,CREATE UNIQUE INDEX refresh_tokens_pkey ON auth.refresh_tokens USING btree (id),null
auth,refresh_tokens,auth.refresh_tokens_session_id_revoked_idx,true,true,false,false,9 5,"CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked)",null
auth,refresh_tokens,auth.refresh_tokens_token_unique,true,true,true,false,3,CREATE UNIQUE INDEX refresh_tokens_token_unique ON auth.refresh_tokens USING btree (token),null
auth,refresh_tokens,auth.refresh_tokens_updated_at_idx,true,true,false,false,7,CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC),null
auth,saml_providers,auth.saml_providers_entity_id_key,true,true,true,false,3,CREATE UNIQUE INDEX saml_providers_entity_id_key ON auth.saml_providers USING btree (entity_id),null
auth,saml_providers,auth.saml_providers_pkey,true,true,true,true,1,CREATE UNIQUE INDEX saml_providers_pkey ON auth.saml_providers USING btree (id),null
auth,saml_providers,auth.saml_providers_sso_provider_id_idx,true,true,false,false,2,CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id),null
auth,saml_relay_states,auth.saml_relay_states_created_at_idx,true,true,false,false,7,CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC),null
auth,saml_relay_states,auth.saml_relay_states_for_email_idx,true,true,false,false,4,CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email),null
auth,saml_relay_states,auth.saml_relay_states_pkey,true,true,true,true,1,CREATE UNIQUE INDEX saml_relay_states_pkey ON auth.saml_relay_states USING btree (id),null
auth,saml_relay_states,auth.saml_relay_states_sso_provider_id_idx,true,true,false,false,2,CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id),null
auth,schema_migrations,auth.schema_migrations_pkey,true,true,true,true,1,CREATE UNIQUE INDEX schema_migrations_pkey ON auth.schema_migrations USING btree (version),null
auth,scim_tokens,auth.scim_tokens_expires_at_idx,true,true,false,false,6,CREATE INDEX scim_tokens_expires_at_idx ON auth.scim_tokens USING btree (expires_at),null
auth,scim_tokens,auth.scim_tokens_pkey,true,true,true,true,1,CREATE UNIQUE INDEX scim_tokens_pkey ON auth.scim_tokens USING btree (id),null
auth,scim_tokens,auth.scim_tokens_revoked_at_idx,true,true,false,false,7,CREATE INDEX scim_tokens_revoked_at_idx ON auth.scim_tokens USING btree (revoked_at),null
auth,scim_tokens,auth.scim_tokens_sso_provider_id_idx,true,true,false,false,2,CREATE INDEX scim_tokens_sso_provider_id_idx ON auth.scim_tokens USING btree (sso_provider_id),null
auth,scim_tokens,auth.scim_tokens_token_hash_key,true,true,true,false,3,CREATE UNIQUE INDEX scim_tokens_token_hash_key ON auth.scim_tokens USING btree (token_hash),null
auth,scim_users,auth.scim_users_created_at_idx,true,true,false,false,2 8 1,"CREATE INDEX scim_users_created_at_idx ON auth.scim_users USING btree (sso_provider_id, created_at, id) WHERE (deleted_at IS NULL)",(deleted_at IS NULL)
auth,scim_users,auth.scim_users_deleted_at_idx,true,true,false,false,10,CREATE INDEX scim_users_deleted_at_idx ON auth.scim_users USING btree (deleted_at),null
auth,scim_users,auth.scim_users_external_id_key,true,true,true,false,2 6,"CREATE UNIQUE INDEX scim_users_external_id_key ON auth.scim_users USING btree (sso_provider_id, external_id) WHERE ((external_id IS NOT NULL) AND (deleted_at IS NULL))",((external_id IS NOT NULL) AND (deleted_at IS NULL))
auth,scim_users,auth.scim_users_id_idx,true,true,false,false,2 1,"CREATE INDEX scim_users_id_idx ON auth.scim_users USING btree (sso_provider_id, id) WHERE (deleted_at IS NULL)",(deleted_at IS NULL)
auth,scim_users,auth.scim_users_pkey,true,true,true,true,1,CREATE UNIQUE INDEX scim_users_pkey ON auth.scim_users USING btree (id),null
auth,scim_users,auth.scim_users_sso_provider_id_idx,true,true,false,false,2,CREATE INDEX scim_users_sso_provider_id_idx ON auth.scim_users USING btree (sso_provider_id),null
auth,scim_users,auth.scim_users_updated_at_idx,true,true,false,false,2 9 1,"CREATE INDEX scim_users_updated_at_idx ON auth.scim_users USING btree (sso_provider_id, updated_at, id) WHERE (deleted_at IS NULL)",(deleted_at IS NULL)
auth,scim_users,auth.scim_users_user_id_idx,true,true,false,false,3,CREATE INDEX scim_users_user_id_idx ON auth.scim_users USING btree (user_id),null
auth,scim_users,auth.scim_users_user_name_idx,true,true,false,false,2 5 1,"CREATE INDEX scim_users_user_name_idx ON auth.scim_users USING btree (sso_provider_id, user_name COLLATE ""C"", id) WHERE (deleted_at IS NULL)",(deleted_at IS NULL)
auth,scim_users,auth.scim_users_user_name_key,true,true,true,false,2 5,"CREATE UNIQUE INDEX scim_users_user_name_key ON auth.scim_users USING btree (sso_provider_id, user_name) WHERE (deleted_at IS NULL)",(deleted_at IS NULL)
auth,sessions,auth.sessions_not_after_idx,true,true,false,false,7,CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC),null
auth,sessions,auth.sessions_oauth_client_id_idx,true,true,false,false,12,CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id),null
auth,sessions,auth.sessions_pkey,true,true,true,true,1,CREATE UNIQUE INDEX sessions_pkey ON auth.sessions USING btree (id),null
auth,sessions,auth.sessions_user_id_idx,true,true,false,false,2,CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id),null
auth,sessions,auth.user_id_created_at_idx,true,true,false,false,2 3,"CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at)",null
auth,sso_domains,auth.sso_domains_domain_idx,true,true,true,false,0,CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain)),null
auth,sso_domains,auth.sso_domains_pkey,true,true,true,true,1,CREATE UNIQUE INDEX sso_domains_pkey ON auth.sso_domains USING btree (id),null
auth,sso_domains,auth.sso_domains_sso_provider_id_idx,true,true,false,false,2,CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id),null
auth,sso_providers,auth.sso_providers_pkey,true,true,true,true,1,CREATE UNIQUE INDEX sso_providers_pkey ON auth.sso_providers USING btree (id),null
auth,sso_providers,auth.sso_providers_resource_id_idx,true,true,true,false,0,CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id)),null
auth,sso_providers,auth.sso_providers_resource_id_pattern_idx,true,true,false,false,2,CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops),null
auth,users,auth.confirmation_token_idx,true,true,true,false,9,CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text),((confirmation_token)::text !~ '^[0-9 ]*$'::text)
auth,users,auth.email_change_token_current_idx,true,true,true,false,28,CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text),((email_change_token_current)::text !~ '^[0-9 ]*$'::text)
auth,users,auth.email_change_token_new_idx,true,true,true,false,13,CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text),((email_change_token_new)::text !~ '^[0-9 ]*$'::text)
auth,users,auth.idx_users_created_at_desc,true,true,false,false,20,CREATE INDEX idx_users_created_at_desc ON auth.users USING btree (created_at DESC),null
auth,users,auth.idx_users_email,true,true,false,false,5,CREATE INDEX idx_users_email ON auth.users USING btree (email),null
auth,users,auth.idx_users_last_sign_in_at_desc,true,true,false,false,16,CREATE INDEX idx_users_last_sign_in_at_desc ON auth.users USING btree (last_sign_in_at DESC),null
auth,users,auth.idx_users_name,true,true,false,false,0,CREATE INDEX idx_users_name ON auth.users USING btree (((raw_user_meta_data ->> 'name'::text))) WHERE ((raw_user_meta_data ->> 'name'::text) IS NOT NULL),((raw_user_meta_data ->> 'name'::text) IS NOT NULL)
auth,users,auth.reauthentication_token_idx,true,true,true,false,31,CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text),((reauthentication_token)::text !~ '^[0-9 ]*$'::text)
auth,users,auth.recovery_token_idx,true,true,true,false,11,CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text),((recovery_token)::text !~ '^[0-9 ]*$'::text)
auth,users,auth.users_email_partial_key,true,true,true,false,5,CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false),(is_sso_user = false)
auth,users,auth.users_instance_id_email_idx,true,true,false,false,1 0,"CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text))",null
auth,users,auth.users_instance_id_idx,true,true,false,false,1,CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id),null
auth,users,auth.users_is_anonymous_idx,true,true,false,false,35,CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous),null
auth,users,auth.users_phone_key,true,true,true,false,22,CREATE UNIQUE INDEX users_phone_key ON auth.users USING btree (phone),null
auth,users,auth.users_pkey,true,true,true,true,2,CREATE UNIQUE INDEX users_pkey ON auth.users USING btree (id),null
auth,webauthn_challenges,auth.webauthn_challenges_expires_at_idx,true,true,false,false,6,CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at),null
auth,webauthn_challenges,auth.webauthn_challenges_pkey,true,true,true,true,1,CREATE UNIQUE INDEX webauthn_challenges_pkey ON auth.webauthn_challenges USING btree (id),null
auth,webauthn_challenges,auth.webauthn_challenges_user_id_idx,true,true,false,false,2,CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id),null
auth,webauthn_credentials,auth.webauthn_credentials_credential_id_key,true,true,true,false,3,CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id),null
auth,webauthn_credentials,auth.webauthn_credentials_pkey,true,true,true,true,1,CREATE UNIQUE INDEX webauthn_credentials_pkey ON auth.webauthn_credentials USING btree (id),null
auth,webauthn_credentials,auth.webauthn_credentials_user_id_idx,true,true,false,false,2,CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id),null
public,activity_types,activity_types_pkey,true,true,true,true,1,CREATE UNIQUE INDEX activity_types_pkey ON public.activity_types USING btree (id),null
public,curated_queue,curated_queue_order_idx,true,true,false,false,1 3 2,"CREATE INDEX curated_queue_order_idx ON public.curated_queue USING btree (""profileId"", ""position"", ""taskId"")",null
public,curated_queue,curated_queue_pkey,true,true,true,true,1 2,"CREATE UNIQUE INDEX curated_queue_pkey ON public.curated_queue USING btree (""profileId"", ""taskId"")",null
public,parking_lot,parking_lot_order_idx,true,true,false,false,1 3 2,"CREATE INDEX parking_lot_order_idx ON public.parking_lot USING btree (""profileId"", ""position"", id)",null
public,parking_lot,parking_lot_pkey,true,true,true,true,1 2,"CREATE UNIQUE INDEX parking_lot_pkey ON public.parking_lot USING btree (""profileId"", id)",null
public,parking_lot,parking_lot_visible_idx,true,true,false,false,1 16,"CREATE INDEX parking_lot_visible_idx ON public.parking_lot USING btree (""profileId"", deleted)",null
public,planner_parking_lot,planner_parking_lot_pkey,true,true,true,true,1,CREATE UNIQUE INDEX planner_parking_lot_pkey ON public.planner_parking_lot USING btree (id),null
public,planner_profiles,planner_profiles_pkey,true,true,true,true,1,CREATE UNIQUE INDEX planner_profiles_pkey ON public.planner_profiles USING btree (id),null
public,planner_tasks,planner_tasks_pkey,true,true,true,true,1,CREATE UNIQUE INDEX planner_tasks_pkey ON public.planner_tasks USING btree (id),null
public,planner_weekly_tasks,planner_weekly_tasks_pkey,true,true,true,true,1,CREATE UNIQUE INDEX planner_weekly_tasks_pkey ON public.planner_weekly_tasks USING btree (id),null
public,project_registry,project_registry_next_scheduled_at_idx,true,true,false,false,10,CREATE INDEX project_registry_next_scheduled_at_idx ON public.project_registry USING btree (next_scheduled_at),null
public,project_registry,project_registry_pkey,true,true,true,true,1,CREATE UNIQUE INDEX project_registry_pkey ON public.project_registry USING btree (id),null
public,project_registry,project_registry_planner_task_id_idx,true,true,false,false,8,CREATE INDEX project_registry_planner_task_id_idx ON public.project_registry USING btree (planner_task_id),null
public,project_registry,project_registry_project_id_idx,true,true,false,false,2,CREATE INDEX project_registry_project_id_idx ON public.project_registry USING btree (project_id),null
public,projects,projects_pkey1,true,true,true,true,1 2,"CREATE UNIQUE INDEX projects_pkey1 ON public.projects USING btree (id, source)",null
public,projects_home,projects_home_external_id_unique,true,true,true,false,2,CREATE UNIQUE INDEX projects_home_external_id_unique ON public.projects_home USING btree (external_id),null
public,projects_home,projects_pkey,true,true,true,true,1,CREATE UNIQUE INDEX projects_pkey ON public.projects_home USING btree (id),null
public,projects_misc,projects_misc_external_id_unique,true,true,true,false,3,CREATE UNIQUE INDEX projects_misc_external_id_unique ON public.projects_misc USING btree (external_id),null
public,projects_misc,projects_misc_pkey,true,true,true,true,1,CREATE UNIQUE INDEX projects_misc_pkey ON public.projects_misc USING btree (id),null
public,projects_repeating,projects_repeating_external_id_unique,true,true,true,false,3,CREATE UNIQUE INDEX projects_repeating_external_id_unique ON public.projects_repeating USING btree (external_id),null
public,projects_repeating,projects_repeating_pkey,true,true,true,true,1,CREATE UNIQUE INDEX projects_repeating_pkey ON public.projects_repeating USING btree (id),null
public,projects_vehicle,project_vehicle_pkey,true,true,true,true,1,CREATE UNIQUE INDEX project_vehicle_pkey ON public.projects_vehicle USING btree (id),null
public,projects_vehicle,projects_vehicle_external_id_unique,true,true,true,false,3,CREATE UNIQUE INDEX projects_vehicle_external_id_unique ON public.projects_vehicle USING btree (external_id),null
public,repeatable_masters,repeatable_masters_pkey,true,true,true,true,1,CREATE UNIQUE INDEX repeatable_masters_pkey ON public.repeatable_masters USING btree (id),null
public,repeatable_overrides,"""repeatable_overrides_projectId_key""",true,true,true,false,2,"CREATE UNIQUE INDEX ""repeatable_overrides_projectId_key"" ON public.repeatable_overrides USING btree (""projectId"")",null
public,repeatable_overrides,repeatable_overrides_pkey,true,true,true,true,1,CREATE UNIQUE INDEX repeatable_overrides_pkey ON public.repeatable_overrides USING btree (id),null
public,staged_queue,staged_queue_order_idx,true,true,false,false,1 3 2,"CREATE INDEX staged_queue_order_idx ON public.staged_queue USING btree (""profileId"", ""position"", id)",null
public,staged_queue,staged_queue_pkey,true,true,true,true,1 2,"CREATE UNIQUE INDEX staged_queue_pkey ON public.staged_queue USING btree (""profileId"", id)",null
public,task_manager,task_manager_pkey,true,true,true,true,1,CREATE UNIQUE INDEX task_manager_pkey ON public.task_manager USING btree (id),null
public,trips,trips_pkey,true,true,true,true,1,CREATE UNIQUE INDEX trips_pkey ON public.trips USING btree (id),null
public,trips_timeline,trip_timeline_pkey,true,true,true,true,3 4,"CREATE UNIQUE INDEX trip_timeline_pkey ON public.trips_timeline USING btree (year, month)",null
public,trips_workflow_metadata,trips_workflow_metadata_pkey,true,true,true,true,1,CREATE UNIQUE INDEX trips_workflow_metadata_pkey ON public.trips_workflow_metadata USING btree (id),null
public,weekly_tasks,weekly_tasks_pkey,true,true,true,true,1,CREATE UNIQUE INDEX weekly_tasks_pkey ON public.weekly_tasks USING btree (id),null
realtime,messages,realtime.messages_inserted_at_topic_index,true,true,false,false,7 1,"CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE))",((extension = 'broadcast'::text) AND (private IS TRUE))
realtime,messages,realtime.messages_pkey,true,true,true,true,8 7,"CREATE UNIQUE INDEX messages_pkey ON ONLY realtime.messages USING btree (id, inserted_at)",null
realtime,schema_migrations,realtime.schema_migrations_pkey,true,true,true,true,1,CREATE UNIQUE INDEX schema_migrations_pkey ON realtime.schema_migrations USING btree (version),null
realtime,subscription,realtime.ix_realtime_subscription_entity,true,true,false,false,3,CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity),null
realtime,subscription,realtime.pk_subscription,true,true,true,true,1,CREATE UNIQUE INDEX pk_subscription ON realtime.subscription USING btree (id),null
realtime,subscription,realtime.subscription_subscription_id_entity_filters_action_filter_selec,true,true,true,false,2 3 4 8 0,"CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_selec ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter, COALESCE(selected_columns, '{}'::text[]))",null
storage,buckets,storage.bname,true,true,true,false,2,CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name),null
storage,buckets,storage.buckets_pkey,true,true,true,true,1,CREATE UNIQUE INDEX buckets_pkey ON storage.buckets USING btree (id),null
storage,buckets_analytics,storage.buckets_analytics_pkey,true,true,true,true,6,CREATE UNIQUE INDEX buckets_analytics_pkey ON storage.buckets_analytics USING btree (id),null
storage,buckets_analytics,storage.buckets_analytics_unique_name_idx,true,true,true,false,1,CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL),(deleted_at IS NULL)
storage,buckets_vectors,storage.buckets_vectors_pkey,true,true,true,true,1,CREATE UNIQUE INDEX buckets_vectors_pkey ON storage.buckets_vectors USING btree (id),null
storage,migrations,storage.migrations_name_key,true,true,true,false,2,CREATE UNIQUE INDEX migrations_name_key ON storage.migrations USING btree (name),null
storage,migrations,storage.migrations_pkey,true,true,true,true,1,CREATE UNIQUE INDEX migrations_pkey ON storage.migrations USING btree (id),null
storage,objects,storage.idx_objects_bucket_id_name,true,true,false,false,2 3,"CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE ""C"")",null
storage,objects,storage.idx_objects_bucket_id_name_lower,true,true,false,false,2 0,"CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE ""C"")",null
storage,objects,storage.idx_objects_current_version,true,true,true,false,2 3,"CREATE UNIQUE INDEX idx_objects_current_version ON storage.objects USING btree (bucket_id, name COLLATE ""C"") WHERE (archived_at IS NULL)",(archived_at IS NULL)
storage,objects,storage.idx_objects_delete_markers,true,true,false,false,2 3,"CREATE INDEX idx_objects_delete_markers ON storage.objects USING btree (bucket_id, name COLLATE ""C"") WHERE is_delete_marker",is_delete_marker
storage,objects,storage.idx_objects_null_version,true,true,true,false,2 3,"CREATE UNIQUE INDEX idx_objects_null_version ON storage.objects USING btree (bucket_id, name COLLATE ""C"") WHERE (NOT is_versioned)",(NOT is_versioned)
storage,objects,storage.name_prefix_search,true,true,false,false,3,CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops),null
storage,objects,storage.objects_bucket_id_name_version_key,true,true,true,false,2 3 10,"CREATE UNIQUE INDEX objects_bucket_id_name_version_key ON storage.objects USING btree (bucket_id, name COLLATE ""C"", version) NULLS NOT DISTINCT",null
storage,objects,storage.objects_pkey,true,true,true,true,1,CREATE UNIQUE INDEX objects_pkey ON storage.objects USING btree (id),null
storage,s3_multipart_uploads,storage.idx_multipart_uploads_list,true,true,false,false,4 5 8,"CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at)",null
storage,s3_multipart_uploads,storage.s3_multipart_uploads_pkey,true,true,true,true,1,CREATE UNIQUE INDEX s3_multipart_uploads_pkey ON storage.s3_multipart_uploads USING btree (id),null
storage,s3_multipart_uploads_parts,storage.s3_multipart_uploads_parts_pkey,true,true,true,true,1,CREATE UNIQUE INDEX s3_multipart_uploads_parts_pkey ON storage.s3_multipart_uploads_parts USING btree (id),null
storage,vector_indexes,storage.vector_indexes_name_bucket_id_idx,true,true,true,false,2 3,"CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id)",null
storage,vector_indexes,storage.vector_indexes_pkey,true,true,true,true,1,CREATE UNIQUE INDEX vector_indexes_pkey ON storage.vector_indexes USING btree (id),null
vault,secrets,vault.secrets_name_idx,true,true,true,false,2,CREATE UNIQUE INDEX secrets_name_idx ON vault.secrets USING btree (name) WHERE (name IS NOT NULL),(name IS NOT NULL)
vault,secrets,vault.secrets_pkey,true,true,true,true,1,CREATE UNIQUE INDEX secrets_pkey ON vault.secrets USING btree (id),null