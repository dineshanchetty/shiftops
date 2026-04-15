CREATE TABLE public.cashup_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashup_id uuid NOT NULL REFERENCES public.daily_cashups(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  file_name text NOT NULL,
  file_data text,
  file_size integer,
  parsed_data jsonb,
  verification_status text DEFAULT 'pending',
  variance_amount numeric(12,2),
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.cashup_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.cashup_documents
  FOR ALL USING (tenant_id = public.get_user_tenant_id());
CREATE INDEX idx_cashup_docs ON public.cashup_documents(cashup_id);
