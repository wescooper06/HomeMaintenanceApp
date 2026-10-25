schema_name,relation_name,tgname,tgisinternal,tgenabled,definition,trigger_function,function_definition
auth,flow_state,RI_ConstraintTrigger_a_16904,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16904"" AFTER DELETE ON auth.flow_state FROM auth.saml_relay_states NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,flow_state,RI_ConstraintTrigger_a_16905,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16905"" AFTER UPDATE ON auth.flow_state FROM auth.saml_relay_states NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,identities,RI_ConstraintTrigger_c_16696,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16696"" AFTER INSERT ON auth.identities FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,identities,RI_ConstraintTrigger_c_16697,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16697"" AFTER UPDATE ON auth.identities FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,mfa_amr_claims,RI_ConstraintTrigger_c_16786,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16786"" AFTER INSERT ON auth.mfa_amr_claims FROM auth.sessions NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,mfa_amr_claims,RI_ConstraintTrigger_c_16787,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16787"" AFTER UPDATE ON auth.mfa_amr_claims FROM auth.sessions NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,mfa_challenges,RI_ConstraintTrigger_c_16774,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16774"" AFTER INSERT ON auth.mfa_challenges FROM auth.mfa_factors NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,mfa_challenges,RI_ConstraintTrigger_c_16775,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16775"" AFTER UPDATE ON auth.mfa_challenges FROM auth.mfa_factors NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,mfa_factors,RI_ConstraintTrigger_a_16772,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16772"" AFTER DELETE ON auth.mfa_factors FROM auth.mfa_challenges NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,mfa_factors,RI_ConstraintTrigger_a_16773,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16773"" AFTER UPDATE ON auth.mfa_factors FROM auth.mfa_challenges NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,mfa_factors,RI_ConstraintTrigger_a_17238,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17238"" AFTER DELETE ON auth.mfa_factors FROM auth.mfa_recovery_code_sets NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,mfa_factors,RI_ConstraintTrigger_a_17239,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17239"" AFTER UPDATE ON auth.mfa_factors FROM auth.mfa_recovery_code_sets NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,mfa_factors,RI_ConstraintTrigger_c_16761,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16761"" AFTER INSERT ON auth.mfa_factors FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,mfa_factors,RI_ConstraintTrigger_c_16762,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16762"" AFTER UPDATE ON auth.mfa_factors FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,mfa_recovery_code_sets,RI_ConstraintTrigger_a_17251,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17251"" AFTER DELETE ON auth.mfa_recovery_code_sets FROM auth.mfa_recovery_codes NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,mfa_recovery_code_sets,RI_ConstraintTrigger_a_17252,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17252"" AFTER UPDATE ON auth.mfa_recovery_code_sets FROM auth.mfa_recovery_codes NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,mfa_recovery_code_sets,RI_ConstraintTrigger_c_17235,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17235"" AFTER INSERT ON auth.mfa_recovery_code_sets FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,mfa_recovery_code_sets,RI_ConstraintTrigger_c_17236,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17236"" AFTER UPDATE ON auth.mfa_recovery_code_sets FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,mfa_recovery_code_sets,RI_ConstraintTrigger_c_17240,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17240"" AFTER INSERT ON auth.mfa_recovery_code_sets FROM auth.mfa_factors NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,mfa_recovery_code_sets,RI_ConstraintTrigger_c_17241,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17241"" AFTER UPDATE ON auth.mfa_recovery_code_sets FROM auth.mfa_factors NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,mfa_recovery_codes,RI_ConstraintTrigger_c_17253,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17253"" AFTER INSERT ON auth.mfa_recovery_codes FROM auth.mfa_recovery_code_sets NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,mfa_recovery_codes,RI_ConstraintTrigger_c_17254,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17254"" AFTER UPDATE ON auth.mfa_recovery_codes FROM auth.mfa_recovery_code_sets NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,oauth_authorizations,RI_ConstraintTrigger_c_17026,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17026"" AFTER INSERT ON auth.oauth_authorizations FROM auth.oauth_clients NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,oauth_authorizations,RI_ConstraintTrigger_c_17027,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17027"" AFTER UPDATE ON auth.oauth_authorizations FROM auth.oauth_clients NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,oauth_authorizations,RI_ConstraintTrigger_c_17031,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17031"" AFTER INSERT ON auth.oauth_authorizations FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,oauth_authorizations,RI_ConstraintTrigger_c_17032,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17032"" AFTER UPDATE ON auth.oauth_authorizations FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,oauth_clients,RI_ConstraintTrigger_a_17024,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17024"" AFTER DELETE ON auth.oauth_clients FROM auth.oauth_authorizations NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,oauth_clients,RI_ConstraintTrigger_a_17025,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17025"" AFTER UPDATE ON auth.oauth_clients FROM auth.oauth_authorizations NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,oauth_clients,RI_ConstraintTrigger_a_17053,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17053"" AFTER DELETE ON auth.oauth_clients FROM auth.oauth_consents NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,oauth_clients,RI_ConstraintTrigger_a_17054,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17054"" AFTER UPDATE ON auth.oauth_clients FROM auth.oauth_consents NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,oauth_clients,RI_ConstraintTrigger_a_17067,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17067"" AFTER DELETE ON auth.oauth_clients FROM auth.sessions NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,oauth_clients,RI_ConstraintTrigger_a_17068,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17068"" AFTER UPDATE ON auth.oauth_clients FROM auth.sessions NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,oauth_consents,RI_ConstraintTrigger_c_17050,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17050"" AFTER INSERT ON auth.oauth_consents FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,oauth_consents,RI_ConstraintTrigger_c_17051,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17051"" AFTER UPDATE ON auth.oauth_consents FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,oauth_consents,RI_ConstraintTrigger_c_17055,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17055"" AFTER INSERT ON auth.oauth_consents FROM auth.oauth_clients NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,oauth_consents,RI_ConstraintTrigger_c_17056,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17056"" AFTER UPDATE ON auth.oauth_consents FROM auth.oauth_clients NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,one_time_tokens,RI_ConstraintTrigger_c_16952,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16952"" AFTER INSERT ON auth.one_time_tokens FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,one_time_tokens,RI_ConstraintTrigger_c_16953,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16953"" AFTER UPDATE ON auth.one_time_tokens FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,refresh_tokens,RI_ConstraintTrigger_c_16729,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16729"" AFTER INSERT ON auth.refresh_tokens FROM auth.sessions NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,refresh_tokens,RI_ConstraintTrigger_c_16730,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16730"" AFTER UPDATE ON auth.refresh_tokens FROM auth.sessions NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,saml_providers,RI_ConstraintTrigger_c_16833,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16833"" AFTER INSERT ON auth.saml_providers FROM auth.sso_providers NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,saml_providers,RI_ConstraintTrigger_c_16834,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16834"" AFTER UPDATE ON auth.saml_providers FROM auth.sso_providers NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,saml_relay_states,RI_ConstraintTrigger_c_16847,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16847"" AFTER INSERT ON auth.saml_relay_states FROM auth.sso_providers NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,saml_relay_states,RI_ConstraintTrigger_c_16848,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16848"" AFTER UPDATE ON auth.saml_relay_states FROM auth.sso_providers NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,saml_relay_states,RI_ConstraintTrigger_c_16906,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16906"" AFTER INSERT ON auth.saml_relay_states FROM auth.flow_state NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,saml_relay_states,RI_ConstraintTrigger_c_16907,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16907"" AFTER UPDATE ON auth.saml_relay_states FROM auth.flow_state NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,scim_tokens,RI_ConstraintTrigger_c_17212,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17212"" AFTER INSERT ON auth.scim_tokens FROM auth.sso_providers NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,scim_tokens,RI_ConstraintTrigger_c_17213,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17213"" AFTER UPDATE ON auth.scim_tokens FROM auth.sso_providers NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,scim_users,RI_ConstraintTrigger_c_17182,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17182"" AFTER INSERT ON auth.scim_users FROM auth.sso_providers NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,scim_users,RI_ConstraintTrigger_c_17183,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17183"" AFTER UPDATE ON auth.scim_users FROM auth.sso_providers NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,scim_users,RI_ConstraintTrigger_c_17187,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17187"" AFTER INSERT ON auth.scim_users FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,scim_users,RI_ConstraintTrigger_c_17188,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17188"" AFTER UPDATE ON auth.scim_users FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,sessions,RI_ConstraintTrigger_a_16727,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16727"" AFTER DELETE ON auth.sessions FROM auth.refresh_tokens NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,sessions,RI_ConstraintTrigger_a_16728,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16728"" AFTER UPDATE ON auth.sessions FROM auth.refresh_tokens NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,sessions,RI_ConstraintTrigger_a_16784,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16784"" AFTER DELETE ON auth.sessions FROM auth.mfa_amr_claims NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,sessions,RI_ConstraintTrigger_a_16785,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16785"" AFTER UPDATE ON auth.sessions FROM auth.mfa_amr_claims NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,sessions,RI_ConstraintTrigger_c_16724,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16724"" AFTER INSERT ON auth.sessions FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,sessions,RI_ConstraintTrigger_c_16725,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16725"" AFTER UPDATE ON auth.sessions FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,sessions,RI_ConstraintTrigger_c_17069,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17069"" AFTER INSERT ON auth.sessions FROM auth.oauth_clients NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,sessions,RI_ConstraintTrigger_c_17070,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17070"" AFTER UPDATE ON auth.sessions FROM auth.oauth_clients NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,sso_domains,RI_ConstraintTrigger_c_16814,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16814"" AFTER INSERT ON auth.sso_domains FROM auth.sso_providers NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,sso_domains,RI_ConstraintTrigger_c_16815,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_16815"" AFTER UPDATE ON auth.sso_domains FROM auth.sso_providers NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,sso_providers,RI_ConstraintTrigger_a_16812,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16812"" AFTER DELETE ON auth.sso_providers FROM auth.sso_domains NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,sso_providers,RI_ConstraintTrigger_a_16813,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16813"" AFTER UPDATE ON auth.sso_providers FROM auth.sso_domains NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,sso_providers,RI_ConstraintTrigger_a_16831,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16831"" AFTER DELETE ON auth.sso_providers FROM auth.saml_providers NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,sso_providers,RI_ConstraintTrigger_a_16832,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16832"" AFTER UPDATE ON auth.sso_providers FROM auth.saml_providers NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,sso_providers,RI_ConstraintTrigger_a_16845,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16845"" AFTER DELETE ON auth.sso_providers FROM auth.saml_relay_states NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,sso_providers,RI_ConstraintTrigger_a_16846,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16846"" AFTER UPDATE ON auth.sso_providers FROM auth.saml_relay_states NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,sso_providers,RI_ConstraintTrigger_a_17180,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17180"" AFTER DELETE ON auth.sso_providers FROM auth.scim_users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,sso_providers,RI_ConstraintTrigger_a_17181,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17181"" AFTER UPDATE ON auth.sso_providers FROM auth.scim_users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,sso_providers,RI_ConstraintTrigger_a_17210,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17210"" AFTER DELETE ON auth.sso_providers FROM auth.scim_tokens NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,sso_providers,RI_ConstraintTrigger_a_17211,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17211"" AFTER UPDATE ON auth.sso_providers FROM auth.scim_tokens NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,users,RI_ConstraintTrigger_a_16694,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16694"" AFTER DELETE ON auth.users FROM auth.identities NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,users,RI_ConstraintTrigger_a_16695,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16695"" AFTER UPDATE ON auth.users FROM auth.identities NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,users,RI_ConstraintTrigger_a_16722,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16722"" AFTER DELETE ON auth.users FROM auth.sessions NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,users,RI_ConstraintTrigger_a_16723,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16723"" AFTER UPDATE ON auth.users FROM auth.sessions NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,users,RI_ConstraintTrigger_a_16759,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16759"" AFTER DELETE ON auth.users FROM auth.mfa_factors NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,users,RI_ConstraintTrigger_a_16760,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16760"" AFTER UPDATE ON auth.users FROM auth.mfa_factors NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,users,RI_ConstraintTrigger_a_16950,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16950"" AFTER DELETE ON auth.users FROM auth.one_time_tokens NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,users,RI_ConstraintTrigger_a_16951,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_16951"" AFTER UPDATE ON auth.users FROM auth.one_time_tokens NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,users,RI_ConstraintTrigger_a_17029,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17029"" AFTER DELETE ON auth.users FROM auth.oauth_authorizations NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,users,RI_ConstraintTrigger_a_17030,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17030"" AFTER UPDATE ON auth.users FROM auth.oauth_authorizations NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,users,RI_ConstraintTrigger_a_17048,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17048"" AFTER DELETE ON auth.users FROM auth.oauth_consents NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,users,RI_ConstraintTrigger_a_17049,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17049"" AFTER UPDATE ON auth.users FROM auth.oauth_consents NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,users,RI_ConstraintTrigger_a_17143,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17143"" AFTER DELETE ON auth.users FROM auth.webauthn_credentials NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,users,RI_ConstraintTrigger_a_17144,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17144"" AFTER UPDATE ON auth.users FROM auth.webauthn_credentials NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,users,RI_ConstraintTrigger_a_17160,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17160"" AFTER DELETE ON auth.users FROM auth.webauthn_challenges NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,users,RI_ConstraintTrigger_a_17161,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17161"" AFTER UPDATE ON auth.users FROM auth.webauthn_challenges NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,users,RI_ConstraintTrigger_a_17185,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17185"" AFTER DELETE ON auth.users FROM auth.scim_users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_setnull_del""()","""RI_FKey_setnull_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_setnull_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_setnull_del$function$
"
auth,users,RI_ConstraintTrigger_a_17186,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17186"" AFTER UPDATE ON auth.users FROM auth.scim_users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,users,RI_ConstraintTrigger_a_17233,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17233"" AFTER DELETE ON auth.users FROM auth.mfa_recovery_code_sets NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
auth,users,RI_ConstraintTrigger_a_17234,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17234"" AFTER UPDATE ON auth.users FROM auth.mfa_recovery_code_sets NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
auth,webauthn_challenges,RI_ConstraintTrigger_c_17162,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17162"" AFTER INSERT ON auth.webauthn_challenges FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,webauthn_challenges,RI_ConstraintTrigger_c_17163,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17163"" AFTER UPDATE ON auth.webauthn_challenges FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
auth,webauthn_credentials,RI_ConstraintTrigger_c_17145,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17145"" AFTER INSERT ON auth.webauthn_credentials FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
auth,webauthn_credentials,RI_ConstraintTrigger_c_17146,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17146"" AFTER UPDATE ON auth.webauthn_credentials FROM auth.users NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
public,curated_queue,RI_ConstraintTrigger_c_18367,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_18367"" AFTER INSERT ON curated_queue FROM planner_profiles NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
public,curated_queue,RI_ConstraintTrigger_c_18368,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_18368"" AFTER UPDATE ON curated_queue FROM planner_profiles NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
public,parking_lot,RI_ConstraintTrigger_c_18351,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_18351"" AFTER INSERT ON parking_lot FROM planner_profiles NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
public,parking_lot,RI_ConstraintTrigger_c_18352,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_18352"" AFTER UPDATE ON parking_lot FROM planner_profiles NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
public,planner_profiles,RI_ConstraintTrigger_a_18349,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_18349"" AFTER DELETE ON planner_profiles FROM parking_lot NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_del""()","""RI_FKey_noaction_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_del$function$
"
public,planner_profiles,RI_ConstraintTrigger_a_18350,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_18350"" AFTER UPDATE ON planner_profiles FROM parking_lot NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
public,planner_profiles,RI_ConstraintTrigger_a_18365,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_18365"" AFTER DELETE ON planner_profiles FROM curated_queue NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_del""()","""RI_FKey_noaction_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_del$function$
"
public,planner_profiles,RI_ConstraintTrigger_a_18366,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_18366"" AFTER UPDATE ON planner_profiles FROM curated_queue NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
public,planner_profiles,RI_ConstraintTrigger_a_18379,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_18379"" AFTER DELETE ON planner_profiles FROM staged_queue NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_del""()","""RI_FKey_noaction_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_del$function$
"
public,planner_profiles,RI_ConstraintTrigger_a_18380,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_18380"" AFTER UPDATE ON planner_profiles FROM staged_queue NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
public,staged_queue,RI_ConstraintTrigger_c_18381,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_18381"" AFTER INSERT ON staged_queue FROM planner_profiles NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
public,staged_queue,RI_ConstraintTrigger_c_18382,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_18382"" AFTER UPDATE ON staged_queue FROM planner_profiles NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
realtime,subscription,tr_check_filters,false,O,CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters(),realtime.subscription_check_filters(),"CREATE OR REPLACE FUNCTION realtime.subscription_check_filters()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
    col_names text[] = coalesce(
            array_agg(a.attname order by a.attnum),
            '{}'::text[]
        )
        from
            pg_catalog.pg_attribute a
        where
            a.attrelid = new.entity
            and a.attnum > 0
            and not a.attisdropped
            and pg_catalog.has_column_privilege(
                (new.claims ->> 'role'),
                a.attrelid,
                a.attnum,
                'SELECT'
            );
    filter realtime.user_defined_filter;
    col_type regtype;
    in_val jsonb;
    selected_col text;
begin
    for filter in select * from unnest(new.filters) loop
        if not filter.column_name = any(col_names) then
            raise exception 'invalid column for filter %', filter.column_name;
        end if;

        col_type = (
            select atttypid::regtype
            from pg_catalog.pg_attribute
            where attrelid = new.entity
                  and attname = filter.column_name
        );
        if col_type is null then
            raise exception 'failed to lookup type for column %', filter.column_name;
        end if;

        if filter.op = 'in'::realtime.equality_op then
            in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
            if coalesce(jsonb_array_length(in_val), 0) > 100 then
                raise exception 'too many values for `in` filter. Maximum 100';
            end if;
        elsif filter.op = 'is'::realtime.equality_op then
            -- `is` requires a keyword RHS rather than a typed literal
            if filter.value not in ('null', 'true', 'false', 'unknown') then
                raise exception 'invalid value for is filter: must be null, true, false, or unknown';
            end if;
            -- IS NULL works for any type, but IS TRUE/FALSE/UNKNOWN require a boolean
            -- operand. Reject the non-null keywords on non-boolean columns here so they
            -- don't abort apply_rls at WAL time.
            if filter.value <> 'null' and col_type <> 'boolean'::regtype then
                raise exception 'is % filter requires a boolean column, got %', filter.value, col_type::text;
            end if;
        elsif filter.op in ('like'::realtime.equality_op, 'ilike'::realtime.equality_op) then
            -- like/ilike apply the text pattern operator (~~); reject column types that
            -- have no such operator instead of failing at WAL time
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = '~~' and oprleft = col_type
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
        elsif filter.op in ('match'::realtime.equality_op, 'imatch'::realtime.equality_op) then
            -- match/imatch apply the regex operators ~ / ~*; reject column types that have
            -- no such operator (e.g. integer) instead of failing at WAL time, mirroring the
            -- like/ilike guard above.
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = case when filter.op = 'imatch'::realtime.equality_op then '~*' else '~' end
                  and oprleft = col_type
                  and oprright = col_type
                  and oprresult = 'boolean'::regtype
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
            -- validate the regex eagerly so a bad pattern is rejected here, not inside
            -- apply_rls where it would abort the WAL stream for the entity
            begin
                perform '' ~ filter.value;
            exception when others then
                raise exception 'invalid regular expression for % filter: %', filter.op::text, sqlerrm;
            end;
        else
            -- eq/neq/lt/lte/gt/gte: value must be coercable to the type
            perform realtime.cast(filter.value, col_type);
        end if;
    end loop;

    if new.selected_columns is not null then
        for selected_col in select * from unnest(new.selected_columns) loop
            if not selected_col = any(col_names) then
                raise exception 'invalid column for select %', selected_col;
            end if;
        end loop;
    end if;

    -- Apply consistent order to filters so the unique constraint can't be tricked by a
    -- different filter order. negate is part of the sort key.
    new.filters = coalesce(
        array_agg(f order by f.column_name, f.op, f.value, f.negate),
        '{}'
    ) from unnest(new.filters) f;

    -- Normalize selected_columns order so ARRAY['a','b'] and ARRAY['b','a'] are treated
    -- as the same subscription group in apply_rls. Preserve an empty array as '{}'
    -- (""primary keys only"") so it stays distinct from NULL (""all columns""); array_agg
    -- over an empty set would otherwise collapse '{}' back to NULL.
    if new.selected_columns is not null then
        new.selected_columns = coalesce(
            (
                select array_agg(c order by c)
                from unnest(new.selected_columns) c
            ),
            '{}'::text[]
        );
    end if;

    return new;
end;
$function$
"
storage,buckets,RI_ConstraintTrigger_a_17292,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17292"" AFTER DELETE ON storage.buckets FROM storage.objects NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_del""()","""RI_FKey_noaction_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_del$function$
"
storage,buckets,RI_ConstraintTrigger_a_17293,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17293"" AFTER UPDATE ON storage.buckets FROM storage.objects NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
storage,buckets,RI_ConstraintTrigger_a_17339,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17339"" AFTER DELETE ON storage.buckets FROM storage.s3_multipart_uploads NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_del""()","""RI_FKey_noaction_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_del$function$
"
storage,buckets,RI_ConstraintTrigger_a_17340,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17340"" AFTER UPDATE ON storage.buckets FROM storage.s3_multipart_uploads NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
storage,buckets,RI_ConstraintTrigger_a_17359,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17359"" AFTER DELETE ON storage.buckets FROM storage.s3_multipart_uploads_parts NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_del""()","""RI_FKey_noaction_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_del$function$
"
storage,buckets,RI_ConstraintTrigger_a_17360,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17360"" AFTER UPDATE ON storage.buckets FROM storage.s3_multipart_uploads_parts NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
storage,buckets,enforce_bucket_name_length_trigger,false,O,CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length(),storage.enforce_bucket_name_length(),"CREATE OR REPLACE FUNCTION storage.enforce_bucket_name_length()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name ""%"" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$function$
"
storage,buckets,protect_bucket_control_insert,false,O,CREATE TRIGGER protect_bucket_control_insert BEFORE INSERT ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns('service_role'),storage.protect_bucket_control_columns(),"CREATE OR REPLACE FUNCTION storage.protect_bucket_control_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  configuration_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.lifecycle_configuration IS NOT NULL
       OR NEW.lifecycle_configuration_generation IS NOT NULL THEN
      IF NOT pg_has_role(current_user, TG_ARGV[0], 'MEMBER') THEN
        RAISE EXCEPTION 'only members of the configured storage service role may insert lifecycle policy state'
          USING ERRCODE = '42501',
                HINT = format(
                  'Insert with both lifecycle columns NULL and configure lifecycle through the Storage API afterward, or insert as a member of %I.',
                  TG_ARGV[0]
                );
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  configuration_changed =
    OLD.lifecycle_configuration IS DISTINCT FROM NEW.lifecycle_configuration
    OR OLD.lifecycle_configuration_generation IS DISTINCT FROM NEW.lifecycle_configuration_generation;

  IF NOT configuration_changed THEN
    RETURN NEW;
  END IF;

  IF NEW.type IS DISTINCT FROM 'STANDARD' THEN
    RAISE EXCEPTION 'bucket versioning and lifecycle controls require a Standard bucket'
      USING ERRCODE = '0A000';
  END IF;

  IF NEW.lifecycle_configuration IS NULL
     AND NEW.lifecycle_configuration_generation IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.lifecycle_configuration IS NULL
     OR NEW.lifecycle_configuration_generation IS NULL
     OR OLD.lifecycle_configuration IS NOT DISTINCT FROM NEW.lifecycle_configuration
     OR OLD.lifecycle_configuration_generation IS NOT DISTINCT FROM NEW.lifecycle_configuration_generation THEN
    RAISE EXCEPTION 'a changed lifecycle policy requires a new non-null generation'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$
"
storage,buckets,protect_bucket_control_update,false,O,"CREATE TRIGGER protect_bucket_control_update BEFORE UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns()",storage.protect_bucket_control_columns(),"CREATE OR REPLACE FUNCTION storage.protect_bucket_control_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  configuration_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.lifecycle_configuration IS NOT NULL
       OR NEW.lifecycle_configuration_generation IS NOT NULL THEN
      IF NOT pg_has_role(current_user, TG_ARGV[0], 'MEMBER') THEN
        RAISE EXCEPTION 'only members of the configured storage service role may insert lifecycle policy state'
          USING ERRCODE = '42501',
                HINT = format(
                  'Insert with both lifecycle columns NULL and configure lifecycle through the Storage API afterward, or insert as a member of %I.',
                  TG_ARGV[0]
                );
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  configuration_changed =
    OLD.lifecycle_configuration IS DISTINCT FROM NEW.lifecycle_configuration
    OR OLD.lifecycle_configuration_generation IS DISTINCT FROM NEW.lifecycle_configuration_generation;

  IF NOT configuration_changed THEN
    RETURN NEW;
  END IF;

  IF NEW.type IS DISTINCT FROM 'STANDARD' THEN
    RAISE EXCEPTION 'bucket versioning and lifecycle controls require a Standard bucket'
      USING ERRCODE = '0A000';
  END IF;

  IF NEW.lifecycle_configuration IS NULL
     AND NEW.lifecycle_configuration_generation IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.lifecycle_configuration IS NULL
     OR NEW.lifecycle_configuration_generation IS NULL
     OR OLD.lifecycle_configuration IS NOT DISTINCT FROM NEW.lifecycle_configuration
     OR OLD.lifecycle_configuration_generation IS NOT DISTINCT FROM NEW.lifecycle_configuration_generation THEN
    RAISE EXCEPTION 'a changed lifecycle policy requires a new non-null generation'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$
"
storage,buckets,protect_bucket_control_update_role,false,O,"CREATE TRIGGER protect_bucket_control_update_role AFTER UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_lifecycle_service_role('service_role')",storage.enforce_bucket_lifecycle_service_role(),"CREATE OR REPLACE FUNCTION storage.enforce_bucket_lifecycle_service_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF current_user::text IS DISTINCT FROM TG_ARGV[0]
     AND (
       OLD.lifecycle_configuration IS DISTINCT FROM NEW.lifecycle_configuration
       OR OLD.lifecycle_configuration_generation IS DISTINCT FROM NEW.lifecycle_configuration_generation
     ) THEN
    -- AFTER runs only after caller RLS has accepted the proposed row. The API
    -- recognizes this specific error after rolling back its permission probe;
    -- direct non-service writes still fail and cannot persist the change.
    RAISE EXCEPTION 'bucket control columns may only be changed by the configured storage service role'
      USING ERRCODE = 'PST01',
            SCHEMA = TG_TABLE_SCHEMA,
            TABLE = TG_TABLE_NAME,
            CONSTRAINT = TG_NAME;
  END IF;

  RETURN NULL;
END;
$function$
"
storage,buckets,protect_buckets_delete,false,O,CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete(),storage.protect_delete(),"CREATE OR REPLACE FUNCTION storage.protect_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$function$
"
storage,buckets_vectors,RI_ConstraintTrigger_a_17424,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17424"" AFTER DELETE ON storage.buckets_vectors FROM storage.vector_indexes NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_del""()","""RI_FKey_noaction_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_del$function$
"
storage,buckets_vectors,RI_ConstraintTrigger_a_17425,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17425"" AFTER UPDATE ON storage.buckets_vectors FROM storage.vector_indexes NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
storage,objects,RI_ConstraintTrigger_c_17294,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17294"" AFTER INSERT ON storage.objects FROM storage.buckets NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
storage,objects,RI_ConstraintTrigger_c_17295,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17295"" AFTER UPDATE ON storage.objects FROM storage.buckets NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
storage,objects,protect_objects_delete,false,O,CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete(),storage.protect_delete(),"CREATE OR REPLACE FUNCTION storage.protect_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$function$
"
storage,objects,update_objects_updated_at,false,O,CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column(),storage.update_updated_at_column(),"CREATE OR REPLACE FUNCTION storage.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$function$
"
storage,s3_multipart_uploads,RI_ConstraintTrigger_a_17354,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17354"" AFTER DELETE ON storage.s3_multipart_uploads FROM storage.s3_multipart_uploads_parts NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_cascade_del""()","""RI_FKey_cascade_del""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_cascade_del""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_cascade_del$function$
"
storage,s3_multipart_uploads,RI_ConstraintTrigger_a_17355,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_a_17355"" AFTER UPDATE ON storage.s3_multipart_uploads FROM storage.s3_multipart_uploads_parts NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_noaction_upd""()","""RI_FKey_noaction_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_noaction_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_noaction_upd$function$
"
storage,s3_multipart_uploads,RI_ConstraintTrigger_c_17341,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17341"" AFTER INSERT ON storage.s3_multipart_uploads FROM storage.buckets NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
storage,s3_multipart_uploads,RI_ConstraintTrigger_c_17342,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17342"" AFTER UPDATE ON storage.s3_multipart_uploads FROM storage.buckets NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
storage,s3_multipart_uploads_parts,RI_ConstraintTrigger_c_17356,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17356"" AFTER INSERT ON storage.s3_multipart_uploads_parts FROM storage.s3_multipart_uploads NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
storage,s3_multipart_uploads_parts,RI_ConstraintTrigger_c_17357,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17357"" AFTER UPDATE ON storage.s3_multipart_uploads_parts FROM storage.s3_multipart_uploads NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
storage,s3_multipart_uploads_parts,RI_ConstraintTrigger_c_17361,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17361"" AFTER INSERT ON storage.s3_multipart_uploads_parts FROM storage.buckets NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
storage,s3_multipart_uploads_parts,RI_ConstraintTrigger_c_17362,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17362"" AFTER UPDATE ON storage.s3_multipart_uploads_parts FROM storage.buckets NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"
storage,vector_indexes,RI_ConstraintTrigger_c_17426,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17426"" AFTER INSERT ON storage.vector_indexes FROM storage.buckets_vectors NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_ins""()","""RI_FKey_check_ins""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_ins""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_ins$function$
"
storage,vector_indexes,RI_ConstraintTrigger_c_17427,true,O,"CREATE CONSTRAINT TRIGGER ""RI_ConstraintTrigger_c_17427"" AFTER UPDATE ON storage.vector_indexes FROM storage.buckets_vectors NOT DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION ""RI_FKey_check_upd""()","""RI_FKey_check_upd""()","CREATE OR REPLACE FUNCTION pg_catalog.""RI_FKey_check_upd""()
 RETURNS trigger
 LANGUAGE internal
 PARALLEL SAFE STRICT
AS $function$RI_FKey_check_upd$function$
"