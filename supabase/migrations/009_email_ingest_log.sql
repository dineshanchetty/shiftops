-- Rate limit inbound email webhook by sender address + IP
CREATE TABLE IF NOT EXISTS email_ingest_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_email TEXT NOT NULL,
  recipient_email TEXT,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  tenant_id UUID,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rate_limited', 'bad_signature', 'no_branch', 'error')),
  error_message TEXT,
  attachments_count INT DEFAULT 0,
  source_ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_ingest_log_sender_created ON email_ingest_log(sender_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_ingest_log_created ON email_ingest_log(created_at DESC);

-- RLS: tenant admins can view their own logs
ALTER TABLE email_ingest_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins see their ingest logs"
  ON email_ingest_log FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY(ARRAY['owner'::text, 'manager'::text]));

COMMENT ON TABLE email_ingest_log IS 'Audit log + rate-limit source for inbound email webhook. Service role writes; tenant admins read.';
