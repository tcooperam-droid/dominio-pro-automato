-- Restringe o clone de testes ao usuário autorizado pelo AuthGate.
-- O isolamento por salão ainda deve ser modelado antes de suportar múltiplos
-- proprietários; até lá, a identidade autorizada é a única fronteira segura.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'employees', 'services', 'clients', 'appointments', 'cash_sessions',
    'cash_entries', 'audit_logs', 'expenses', 'commission_closings',
    'service_packages', 'accounting_companies',
    'accounting_company_memberships', 'accounting_appointment_assignments',
    'accounting_exports'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', table_name);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_%I_access ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY authenticated_%I_access ON public.%I FOR ALL TO authenticated USING ((auth.jwt() ->> ''email'') = ''tcooperam@gmail.com'') WITH CHECK ((auth.jwt() ->> ''email'') = ''tcooperam@gmail.com'')',
      table_name, table_name
    );
  END LOOP;
END $$;

-- As tabelas usam bigserial/identity; não permitir que anon consuma ou manipule
-- sequências mesmo quando uma configuração de privilégio for alterada no futuro.
REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Função de mutação também deve ser chamada apenas pela sessão autorizada.
REVOKE EXECUTE ON FUNCTION public.update_employee_working_hours() FROM anon;
GRANT EXECUTE ON FUNCTION public.update_employee_working_hours() TO authenticated;
ALTER FUNCTION public.update_employee_working_hours() SET search_path = public;
