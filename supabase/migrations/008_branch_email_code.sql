-- Multi-tenant per-branch email ingestion
-- Each branch gets a unique 6-char code for inbound email routing
-- Address format: aura+<code>@aura.shiftops.co.za

-- Add email_code column (nullable initially for backfill)
ALTER TABLE branches ADD COLUMN IF NOT EXISTS email_code TEXT UNIQUE;

-- Function to generate unique 6-char code (avoids ambiguous chars 0/O/1/l/I)
CREATE OR REPLACE FUNCTION generate_branch_email_code() RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghjkmnpqrstuvwxyz23456789';
  code TEXT;
  exists_count INT;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    SELECT COUNT(*) INTO exists_count FROM branches WHERE email_code = code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Backfill existing branches
UPDATE branches SET email_code = generate_branch_email_code() WHERE email_code IS NULL;

-- Auto-generate on insert
CREATE OR REPLACE FUNCTION set_branch_email_code() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email_code IS NULL THEN
    NEW.email_code := generate_branch_email_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS branches_email_code_trigger ON branches;
CREATE TRIGGER branches_email_code_trigger
  BEFORE INSERT ON branches
  FOR EACH ROW EXECUTE FUNCTION set_branch_email_code();

-- Make it required going forward
ALTER TABLE branches ALTER COLUMN email_code SET NOT NULL;

-- Add helpful comment
COMMENT ON COLUMN branches.email_code IS 'Unique 6-char code for inbound email routing. Full address: aura+<code>@aura.shiftops.co.za';
