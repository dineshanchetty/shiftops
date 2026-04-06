import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Aura FTP Poller — Scheduled Edge Function
 *
 * Designed to run on pg_cron schedule: every 30 minutes, 6am-11pm SAST.
 * Polls configured Aura POS SFTP servers for new cashup CSV exports,
 * parses them using tenant-specific field mappings, and inserts them
 * into the aura_imports table for manager review.
 *
 * Schedule (pg_cron):
 *   SELECT cron.schedule(
 *     'aura-ftp-poll',
 *     '*/30 6-23 * * *',
 *     $$SELECT net.http_post(
 *       url := 'https://twueamtpxsbejihsmduc.supabase.co/functions/v1/aura-ftp-poller',
 *       headers := jsonb_build_object(
 *         'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
 *       )
 *     );$$
 *   );
 */

Deno.serve(async (req: Request) => {
  try {
    // Create Supabase client with service role key for admin access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query all branches that have Aura FTP configured
    const { data: branches, error: branchError } = await supabase
      .from("branches")
      .select("id, name, tenant_id, aura_ftp_host, aura_ftp_user, aura_ftp_pass_encrypted, aura_export_path")
      .not("aura_ftp_host", "is", null)
      .neq("aura_ftp_host", "");

    if (branchError) {
      console.error("Error fetching branches:", branchError.message);
      return new Response(
        JSON.stringify({ error: "Failed to fetch branches", details: branchError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!branches || branches.length === 0) {
      console.log("No branches with Aura FTP configured.");
      return new Response(
        JSON.stringify({ processed: 0, branches: [], message: "No branches with Aura FTP configured" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const processedBranches: string[] = [];

    for (const branch of branches) {
      console.log(`Checking branch: ${branch.name} (${branch.id})`);

      // -------------------------------------------------------------------
      // SFTP Connection — STUB
      //
      // Actual implementation requires a Deno-compatible SFTP library.
      // Recommended: https://deno.land/x/ssh2 or a similar SSH/SFTP client.
      //
      // Steps to implement:
      //
      // 1. Decrypt SFTP password from Supabase Vault:
      //    const { data: secret } = await supabase.rpc('vault_decrypt', {
      //      encrypted_value: branch.aura_ftp_pass_encrypted
      //    });
      //
      // 2. Connect to SFTP server:
      //    const sftp = new SFTPClient();
      //    await sftp.connect({
      //      host: branch.aura_ftp_host,
      //      username: branch.aura_ftp_user,
      //      password: decryptedPassword,
      //    });
      //
      // 3. List files matching today's cashup pattern:
      //    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      //    const files = await sftp.list(branch.aura_export_path);
      //    const cashupFiles = files.filter(f =>
      //      f.name.match(new RegExp(`_cashup_${today}\\.csv$`))
      //    );
      //
      // 4. Check which files haven't been imported yet:
      //    const { data: existingImports } = await supabase
      //      .from('aura_imports')
      //      .select('source_file')
      //      .eq('branch_id', branch.id)
      //      .in('source_file', cashupFiles.map(f => f.name));
      //    const newFiles = cashupFiles.filter(f =>
      //      !existingImports?.some(i => i.source_file === f.name)
      //    );
      //
      // 5. Download and parse each new file:
      //    for (const file of newFiles) {
      //      const csvData = await sftp.get(`${branch.aura_export_path}/${file.name}`);
      //      const parsed = parseCSV(csvData, tenantFieldMapping);
      //
      //      // Insert into aura_imports
      //      await supabase.from('aura_imports').insert({
      //        tenant_id: branch.tenant_id,
      //        branch_id: branch.id,
      //        source_file: file.name,
      //        import_date: today,
      //        status: 'pending_review',
      //        raw_data: parsed,
      //        parsed_at: new Date().toISOString(),
      //      });
      //
      //      // Auto-create or update daily_cashup record
      //      await supabase.from('daily_cashups').upsert({
      //        tenant_id: branch.tenant_id,
      //        branch_id: branch.id,
      //        date: today,
      //        gross_turnover: parsed.gross_turnover,
      //        // ... map other fields from parsed data
      //        aura_import_id: importRecord.id,
      //        status: 'draft',
      //      }, { onConflict: 'branch_id,date' });
      //    }
      //
      // 6. Disconnect:
      //    await sftp.end();
      // -------------------------------------------------------------------

      processedBranches.push(branch.name);
    }

    console.log(`Polling complete. Checked ${processedBranches.length} branches.`);

    return new Response(
      JSON.stringify({
        processed: processedBranches.length,
        branches: processedBranches,
        message: "FTP poll cycle complete (SFTP connection stubbed — see comments for implementation)",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error in aura-ftp-poller:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
