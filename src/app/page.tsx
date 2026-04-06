import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if user has completed onboarding (has tenant membership)
  const { data: member } = await supabase
    .from("tenant_members")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!member) {
    redirect("/setup");
  }

  redirect("/app");
}
