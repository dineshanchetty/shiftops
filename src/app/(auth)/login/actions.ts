"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function login(formData: { email: string; password: string }) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.email,
    password: formData.password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/app");
}
