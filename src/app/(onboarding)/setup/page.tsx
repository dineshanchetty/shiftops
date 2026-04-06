"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

/* ---------- Schemas ---------- */

const companySchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase alphanumeric with hyphens only"
    ),
});

const branchSchema = z.object({
  branchName: z.string().min(1, "Branch name is required"),
  brandId: z.string().min(1, "Please select a brand"),
  address: z.string().optional(),
});

type CompanyFormData = z.infer<typeof companySchema>;
type BranchFormData = z.infer<typeof branchSchema>;

/* ---------- Step Indicator ---------- */

function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = [
    "Company Details",
    "Add Brands",
    "First Branch",
    "Complete",
  ];

  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((label, index) => {
        const stepNum = index + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;

        return (
          <div key={label} className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-[var(--color-accent)] text-white"
                    : isCompleted
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                    : "bg-[var(--color-surface-3)] text-[var(--color-base-400)]"
                }`}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <span
                className={`mt-1 text-xs hidden sm:block ${
                  isActive
                    ? "font-medium text-[var(--color-base-900)]"
                    : "text-[var(--color-base-400)]"
                }`}
              >
                {label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`h-px w-8 sm:w-12 ${
                  stepNum < currentStep
                    ? "bg-[var(--color-accent)]"
                    : "bg-[var(--color-base-200)]"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Main Page ---------- */

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared state across steps
  const [companyData, setCompanyData] = useState<CompanyFormData | null>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const [branchData, setBranchData] = useState<BranchFormData | null>(null);

  const goNext = () => setStep((s) => Math.min(s + 1, 4));
  const goBack = () => setStep((s) => Math.max(s - 1, 1));

  return (
    <div className="flex min-h-screen items-start justify-center bg-[var(--color-surface-2)] px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="font-[var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-base-900)]">
            Shift<span className="text-[var(--color-accent)]">Ops</span>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-base-400)]">
            Set up your workspace
          </p>
        </div>

        <StepIndicator currentStep={step} />

        {error && (
          <div className="mb-4 rounded-lg bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-[var(--color-base-200)]">
          <div
            key={step}
            className="animate-[fadeIn_200ms_ease-in-out]"
            style={{ animation: "fadeIn 200ms ease-in-out" }}
          >
            {step === 1 && (
              <Step1Company
                defaultValues={companyData}
                onNext={(data) => {
                  setCompanyData(data);
                  goNext();
                }}
              />
            )}
            {step === 2 && (
              <Step2Brands
                brands={brands}
                setBrands={setBrands}
                onNext={goNext}
                onBack={goBack}
              />
            )}
            {step === 3 && (
              <Step3Branch
                brands={brands}
                defaultValues={branchData}
                onNext={(data) => {
                  setBranchData(data);
                  goNext();
                }}
                onBack={goBack}
              />
            )}
            {step === 4 && (
              <Step4Complete
                companyData={companyData!}
                brands={brands}
                branchData={branchData!}
                isSubmitting={isSubmitting}
                onBack={goBack}
                onFinish={async () => {
                  setError(null);
                  setIsSubmitting(true);
                  try {
                    await handleFinalSubmit(
                      companyData!,
                      brands,
                      branchData!
                    );
                    router.push("/app");
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Something went wrong. Please try again."
                    );
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

/* ---------- Step 1: Company Details ---------- */

function Step1Company({
  defaultValues,
  onNext,
}: {
  defaultValues: CompanyFormData | null;
  onNext: (data: CompanyFormData) => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    defaultValues: defaultValues ?? { companyName: "", slug: "" },
  });

  const companyName = watch("companyName");

  useEffect(() => {
    if (!defaultValues) {
      const generated = companyName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      setValue("slug", generated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyName, setValue]);

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-4">
      <h3 className="text-lg font-semibold text-[var(--color-base-900)] mb-4">
        Company Details
      </h3>

      <div>
        <label htmlFor="companyName" className="block text-sm font-medium text-gray-900 mb-1.5">
          Company Name
        </label>
        <input
          id="companyName"
          type="text"
          className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)] outline-none transition-colors"
          placeholder="My Restaurant Group"
          {...register("companyName")}
        />
        {errors.companyName && (
          <p className="mt-1 text-sm text-red-600">{errors.companyName.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-gray-900 mb-1.5">
          Slug
        </label>
        <input
          id="slug"
          type="text"
          className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)] outline-none transition-colors"
          placeholder="my-restaurant-group"
          {...register("slug")}
        />
        <p className="mt-1 text-xs text-[var(--color-base-400)]">
          Used in URLs. Lowercase letters, numbers, and hyphens only.
        </p>
        {errors.slug && (
          <p className="mt-1 text-sm text-red-600">{errors.slug.message}</p>
        )}
      </div>

      <button
        type="submit"
        className="w-full bg-[var(--color-accent)] text-white font-semibold rounded-lg px-4 py-2 hover:bg-[var(--color-accent-hover)] transition-all active:scale-[0.98] h-10"
      >
        Next
      </button>
    </form>
  );
}

/* ---------- Step 2: Add Brands ---------- */

function Step2Brands({
  brands,
  setBrands,
  onNext,
  onBack,
}: {
  brands: string[];
  setBrands: (brands: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [brandInput, setBrandInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const addBrand = () => {
    const trimmed = brandInput.trim();
    if (!trimmed) return;
    if (brands.includes(trimmed)) {
      setValidationError("This brand already exists.");
      return;
    }
    setBrands([...brands, trimmed]);
    setBrandInput("");
    setValidationError(null);
  };

  const removeBrand = (index: number) => {
    setBrands(brands.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    if (brands.length === 0) {
      setValidationError("Add at least one brand to continue.");
      return;
    }
    onNext();
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-[var(--color-base-900)] mb-4">
        Add Brands
      </h3>

      <div>
        <label htmlFor="brandName" className="block text-sm font-medium text-gray-900 mb-1.5">
          Brand Name
        </label>
        <div className="flex gap-2">
          <input
            id="brandName"
            type="text"
            className="h-10 flex-1 rounded-lg border border-gray-200 px-3 text-sm focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)] outline-none transition-colors"
            placeholder="e.g. Pizza Palace"
            value={brandInput}
            onChange={(e) => {
              setBrandInput(e.target.value);
              setValidationError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addBrand();
              }
            }}
          />
          <button
            type="button"
            onClick={addBrand}
            className="h-10 rounded-lg border border-[var(--color-accent)] px-4 text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] transition-colors"
          >
            Add Brand
          </button>
        </div>
        {validationError && (
          <p className="mt-1 text-sm text-red-600">{validationError}</p>
        )}
      </div>

      {brands.length > 0 && (
        <ul className="space-y-2">
          {brands.map((brand, index) => (
            <li
              key={index}
              className="flex items-center justify-between rounded-lg bg-[var(--color-surface-2)] px-3 py-2"
            >
              <span className="text-sm text-[var(--color-base-900)]">{brand}</span>
              <button
                type="button"
                onClick={() => removeBrand(index)}
                className="text-sm text-[var(--color-base-400)] hover:text-red-500 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="h-10 flex-1 rounded-lg border border-gray-200 px-4 text-sm font-medium text-[var(--color-base-600)] hover:bg-[var(--color-surface-3)] transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="h-10 flex-1 bg-[var(--color-accent)] text-white font-semibold rounded-lg px-4 hover:bg-[var(--color-accent-hover)] transition-all active:scale-[0.98]"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/* ---------- Step 3: First Branch ---------- */

function Step3Branch({
  brands,
  defaultValues,
  onNext,
  onBack,
}: {
  brands: string[];
  defaultValues: BranchFormData | null;
  onNext: (data: BranchFormData) => void;
  onBack: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BranchFormData>({
    resolver: zodResolver(branchSchema),
    defaultValues: defaultValues ?? {
      branchName: "",
      brandId: "",
      address: "",
    },
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-4">
      <h3 className="text-lg font-semibold text-[var(--color-base-900)] mb-4">
        First Branch
      </h3>

      <div>
        <label htmlFor="branchName" className="block text-sm font-medium text-gray-900 mb-1.5">
          Branch Name
        </label>
        <input
          id="branchName"
          type="text"
          className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)] outline-none transition-colors"
          placeholder="e.g. Downtown Location"
          {...register("branchName")}
        />
        {errors.branchName && (
          <p className="mt-1 text-sm text-red-600">{errors.branchName.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="brandId" className="block text-sm font-medium text-gray-900 mb-1.5">
          Brand
        </label>
        <select
          id="brandId"
          className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)] outline-none transition-colors bg-white"
          {...register("brandId")}
        >
          <option value="">Select a brand</option>
          {brands.map((brand, index) => (
            <option key={index} value={brand}>
              {brand}
            </option>
          ))}
        </select>
        {errors.brandId && (
          <p className="mt-1 text-sm text-red-600">{errors.brandId.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-900 mb-1.5">
          Address <span className="text-[var(--color-base-400)] font-normal">(optional)</span>
        </label>
        <input
          id="address"
          type="text"
          className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)] outline-none transition-colors"
          placeholder="123 Main Street"
          {...register("address")}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="h-10 flex-1 rounded-lg border border-gray-200 px-4 text-sm font-medium text-[var(--color-base-600)] hover:bg-[var(--color-surface-3)] transition-colors"
        >
          Back
        </button>
        <button
          type="submit"
          className="h-10 flex-1 bg-[var(--color-accent)] text-white font-semibold rounded-lg px-4 hover:bg-[var(--color-accent-hover)] transition-all active:scale-[0.98]"
        >
          Next
        </button>
      </div>
    </form>
  );
}

/* ---------- Step 4: Complete ---------- */

function Step4Complete({
  companyData,
  brands,
  branchData,
  isSubmitting,
  onBack,
  onFinish,
}: {
  companyData: CompanyFormData;
  brands: string[];
  branchData: BranchFormData;
  isSubmitting: boolean;
  onBack: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-[var(--color-base-900)]">
        Review &amp; Complete
      </h3>

      <div className="space-y-4">
        <div className="rounded-lg bg-[var(--color-surface-2)] p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-base-400)] mb-2">
            Company
          </p>
          <p className="text-sm font-medium text-[var(--color-base-900)]">
            {companyData.companyName}
          </p>
          <p className="text-xs text-[var(--color-base-400)] mt-0.5">
            {companyData.slug}
          </p>
        </div>

        <div className="rounded-lg bg-[var(--color-surface-2)] p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-base-400)] mb-2">
            Brands
          </p>
          <div className="flex flex-wrap gap-2">
            {brands.map((brand, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-md bg-[var(--color-accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent)]"
              >
                {brand}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-[var(--color-surface-2)] p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-base-400)] mb-2">
            First Branch
          </p>
          <p className="text-sm font-medium text-[var(--color-base-900)]">
            {branchData.branchName}
          </p>
          <p className="text-xs text-[var(--color-base-400)] mt-0.5">
            Brand: {branchData.brandId}
            {branchData.address ? ` | ${branchData.address}` : ""}
          </p>
        </div>

        <div className="rounded-lg bg-[var(--color-surface-2)] p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-base-400)] mb-2">
            Default Positions
          </p>
          <div className="flex flex-wrap gap-2">
            {["FOH", "BOH", "Driver", "Manager"].map((pos) => (
              <span
                key={pos}
                className="inline-flex items-center rounded-md bg-[var(--color-surface-3)] px-2.5 py-1 text-xs font-medium text-[var(--color-base-600)]"
              >
                {pos}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="h-10 flex-1 rounded-lg border border-gray-200 px-4 text-sm font-medium text-[var(--color-base-600)] hover:bg-[var(--color-surface-3)] transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onFinish}
          disabled={isSubmitting}
          className="h-10 flex-1 bg-[var(--color-accent)] text-white font-semibold rounded-lg px-4 hover:bg-[var(--color-accent-hover)] transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Setting up..." : "Go to Dashboard"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Final Submit Logic ---------- */

async function handleFinalSubmit(
  companyData: CompanyFormData,
  brands: string[],
  branchData: BranchFormData
) {
  const supabase = createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("You must be logged in to complete setup.");
  }

  // 1. Create tenant
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({
      name: companyData.companyName,
      slug: companyData.slug,
    })
    .select("id")
    .single();

  if (tenantError) {
    throw new Error(tenantError.message);
  }

  const tenantId = tenant.id;

  // 2. Create tenant_member (owner)
  const { error: memberError } = await supabase.from("tenant_members").insert({
    tenant_id: tenantId,
    user_id: user.id,
    role: "owner",
  });

  if (memberError) {
    throw new Error(memberError.message);
  }

  // 3. Insert brands
  const brandInserts = brands.map((name) => ({
    tenant_id: tenantId,
    name,
  }));

  const { data: insertedBrands, error: brandsError } = await supabase
    .from("brands")
    .insert(brandInserts)
    .select("id, name");

  if (brandsError) {
    throw new Error(brandsError.message);
  }

  // 4. Find the brand for the branch
  const selectedBrand = insertedBrands?.find(
    (b) => b.name === branchData.brandId
  );

  // 5. Insert branch
  if (!selectedBrand) {
    throw new Error("Could not find the selected brand.");
  }
  const { error: branchError } = await supabase.from("branches").insert({
    tenant_id: tenantId,
    brand_id: selectedBrand.id,
    name: branchData.branchName,
    address: branchData.address || null,
  });

  if (branchError) {
    throw new Error(branchError.message);
  }

  // 6. Insert default positions
  const defaultPositions = ["FOH", "BOH", "Driver", "Manager"];
  const positionInserts = defaultPositions.map((name) => ({
    tenant_id: tenantId,
    name,
  }));

  const { error: positionsError } = await supabase
    .from("positions")
    .insert(positionInserts);

  if (positionsError) {
    throw new Error(positionsError.message);
  }
}
