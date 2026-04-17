-- Extend branches.email_code from 6 to 8 chars for harder enumeration
-- 31^8 = 852 billion combinations (~1000x harder to guess than 6 chars)

-- New generator function
CREATE OR REPLACE FUNCTION generate_branch_email_code() RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghjkmnpqrstuvwxyz23456789';
  code TEXT;
  exists_count INT;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    SELECT COUNT(*) INTO exists_count FROM branches WHERE email_code = code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Regenerate existing 6-char codes to 8-char codes
-- (old codes still work in practice until this migration runs)
UPDATE branches SET email_code = generate_branch_email_code() WHERE length(email_code) < 8;

COMMENT ON COLUMN branches.email_code IS 'Unique 8-char code for inbound email routing. Full address: aura+<code>@aura.shiftops.co.za';
