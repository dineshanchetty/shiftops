"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

const signupSchema = z
  .object({
    fullName: z.string().min(1, "Full name is required"),
    email: z.string().min(1, "Email is required").email("Invalid email address"),
    password: z
      .string()
      .min(1, "Password is required")
      .min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignupFormData = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormData) => {
    setServerError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.fullName,
          },
        },
      });

      if (error) {
        setServerError(error.message);
        return;
      }

      router.push("/setup");
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-[var(--color-base-900)] mb-1">
        Create your account
      </h2>
      <p className="text-sm text-[var(--color-base-400)] mb-6">
        Get started with ShiftOps
      </p>

      {serverError && (
        <div className="mb-4 rounded-lg bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-red-600">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-900 mb-1.5">
            Full Name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)] outline-none transition-colors"
            placeholder="John Doe"
            {...register("fullName")}
          />
          {errors.fullName && (
            <p className="mt-1 text-sm text-red-600">{errors.fullName.message}</p>
          )}
        </div>

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
            autoComplete="new-password"
            className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)] outline-none transition-colors"
            placeholder="At least 6 characters"
            {...register("password")}
          />
          {errors.password && (
            <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-900 mb-1.5">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)] outline-none transition-colors"
            placeholder="Confirm your password"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-[var(--color-accent)] text-white font-semibold rounded-lg px-4 py-2 hover:bg-[var(--color-accent-hover)] transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed h-10"
        >
          {isLoading ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-[var(--color-base-400)]">
        14-day free trial. No credit card required.
      </p>

      <p className="mt-4 text-center text-sm text-[var(--color-base-400)]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
