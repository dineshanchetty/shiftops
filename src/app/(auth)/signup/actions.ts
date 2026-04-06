"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signup(formData: {
  fullName: string;
  email: string;
  password: string;
}) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password,
    options: {
      data: {
        full_name: formData.fullName,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/setup");
}
