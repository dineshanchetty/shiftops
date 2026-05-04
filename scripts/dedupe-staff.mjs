#!/usr/bin/env node
/**
 * Dedupe staff records that share the same normalized name within the same branch.
 * For each duplicate group: keep the OLDEST (smallest created_at), migrate roster_entries
 * to it, delete the others. Idempotent: --dry-run for preview, --apply to commit.
 */

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

async function loadEnv() {
  const file = process.env.SHIFTOPS_IMPORT_ENV;
  if (file) {
    const txt = await readFile(file, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
await loadEnv();

const apply = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const norm = (s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const { data: staff } = await sb.from("staff").select("id, first_name, last_name, branch_id, tenant_id, created_at").order("created_at");
const groups = new Map();
for (const s of staff ?? []) {
  const key = `${s.branch_id}::${norm(s.first_name)}::${norm(s.last_name)}`;
  (groups.get(key) ?? groups.set(key, []).get(key)).push(s);
}

const dupGroups = [...groups.values()].filter((g) => g.length > 1);
console.log(`\nFound ${dupGroups.length} duplicate groups across ${dupGroups.reduce((s, g) => s + g.length - 1, 0)} extra rows.\n`);

let totalRosterMoved = 0;
let totalRosterConflicts = 0;
let totalStaffDeleted = 0;

for (const grp of dupGroups) {
  const keeper = grp[0]; // oldest
  const dupes = grp.slice(1);
  console.log(`── ${keeper.first_name} ${keeper.last_name}  (branch ${keeper.branch_id.slice(0, 8)})`);
  console.log(`   keep:   ${keeper.id}`);
  for (const d of dupes) {
    console.log(`   delete: ${d.id}`);

    // Pull roster_entries for dupe and keeper
    const [{ data: dupeEntries }, { data: keepEntries }] = await Promise.all([
      sb.from("roster_entries").select("id, date").eq("staff_id", d.id),
      sb.from("roster_entries").select("date").eq("staff_id", keeper.id),
    ]);
    const keepDates = new Set((keepEntries ?? []).map((r) => r.date));
    const toMove = (dupeEntries ?? []).filter((r) => !keepDates.has(r.date));
    const toDelete = (dupeEntries ?? []).filter((r) => keepDates.has(r.date));

    console.log(`     roster: move ${toMove.length}, drop ${toDelete.length} conflicts`);
    totalRosterMoved += toMove.length;
    totalRosterConflicts += toDelete.length;

    if (apply) {
      // Drop conflicting rows on dupe (keeper already has that date)
      if (toDelete.length > 0) {
        const ids = toDelete.map((r) => r.id);
        await sb.from("roster_entries").delete().in("id", ids);
      }
      // Move remaining
      if (toMove.length > 0) {
        const ids = toMove.map((r) => r.id);
        const { error } = await sb.from("roster_entries").update({ staff_id: keeper.id }).in("id", ids);
        if (error) console.error(`     ✗ move failed: ${error.message}`);
      }
      // Delete dupe staff
      const { error: delErr } = await sb.from("staff").delete().eq("id", d.id);
      if (delErr) console.error(`     ✗ delete staff failed: ${delErr.message}`);
      else totalStaffDeleted++;
    }
  }
}

console.log(`\n${apply ? "APPLIED" : "DRY RUN"}: ${totalStaffDeleted} dupe staff ${apply ? "deleted" : "would be deleted"}`);
console.log(`         ${totalRosterMoved} roster_entries ${apply ? "moved" : "would be moved"}, ${totalRosterConflicts} ${apply ? "dropped (conflicts)" : "would be dropped (conflicts)"}\n`);
