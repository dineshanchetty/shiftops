"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        setServerError(error.message);
        return;
      }

      router.push("/app");
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-[var(--color-base-900)] mb-1">
        Welcome back
      </h2>
      <p className="text-sm text-[var(--color-base-400)] mb-6">
        Sign in to your account
      </p>

      {serverError && (
        <div className="mb-4 rounded-lg bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-red-600">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-900 mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)] outline-none transition-colors"
            placeholder="you@example.com"
            {...register("email")}
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-900 mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)] outline-none transition-colors"
            placeholder="Enter your password"
            {...register("password")}
          />
          {errors.password && (
            <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-[var(--color-accent)] text-white font-semibold rounded-lg px-4 py-2 hover:bg-[var(--color-accent-hover)] transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed h-10"
        >
          {isLoading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-base-400)]">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
