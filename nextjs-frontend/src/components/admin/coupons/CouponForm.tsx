"use client";

import {
  AdminCouponCreate,
  AdminCouponRead,
  AdminCouponUpdate,
} from "@/api/admin-coupons";
import { fetchAllCourses, fetchAllPaintings } from "@/api/admin-courses-products";
import { GhostBtn, PrimaryBtn } from "@/components/ui/buttons";
import { CustomSelect } from "@/components/ui/custom-select";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, ImageUp, Plus, Save, Trash2, X, Loader2 } from "lucide-react";
import { Controller, Resolver, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

// ── Schema ───────────────────────────────────────────────────────────────────────

const couponSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  description: z.string().optional(),
  discount_type: z.enum(["percentage", "fixed"]),
  discount_value: z.coerce.number().min(0.01, "Discount value must be > 0"),
  max_discount: z.coerce.number().min(0).optional().nullable(),
  applies_to: z.enum([
    "all",
    "courses",
    "paintings",
    "selected_courses",
    "selected_paintings",
  ]),
  restriction_type: z.enum(["all_eligible", "selected_products"]),
  min_order_amount: z.coerce.number().min(0).default(0),
  usage_limit: z.coerce.number().min(1).optional().nullable(),
  per_user_limit: z.coerce.number().min(1).default(1),
  starts_at: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  course_ids: z.array(z.object({ value: z.string().min(1, "Cannot be empty") })).default(() => []),
  painting_ids: z.array(z.object({ value: z.string().min(1, "Cannot be empty") })).default(() => []),
});

type CouponSchemaValues = z.infer<typeof couponSchema>;

// ── External, API-facing shape — plain string arrays ──────────────────────────

export interface CouponFormValues {
  code: string;
  description?: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_discount?: number | null;
  applies_to:
    | "all"
    | "courses"
    | "paintings"
    | "selected_courses"
    | "selected_paintings";
  restriction_type: "all_eligible" | "selected_products";
  min_order_amount: number;
  usage_limit?: number | null;
  per_user_limit: number;
  starts_at?: string | null;
  expires_at?: string | null;
  is_active: boolean;
  course_ids: string[];
  painting_ids: string[];
}

interface CouponFormProps {
  initialData?: AdminCouponRead | null;
  onSubmit: (data: CouponFormValues) => Promise<void> | void;
  isSubmitting: boolean;
}

// ── Local UI components ──────────────────────────────────────────────────────────

function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "text-label! font-mono tracking-widest uppercase text-text-muted block mb-2",
        className
      )}
    >
      {children}
    </label>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...rest }, ref) => (
    <div className="space-y-1 w-full">
      <input
        ref={ref}
        type={type}
        className={cn(
          "w-full bg-surface border border-border px-4 py-3 text-sm text-foreground rounded-sm focus:border-primary outline-none transition-all duration-300 placeholder:text-text-muted/50 font-mono",
          type === "number" &&
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          error && "border-danger danger-glow",
          className
        )}
        {...rest}
      />
      {error && <p className="text-xs text-danger font-mono mt-1">{error}</p>}
    </div>
  )
);
Input.displayName = "Input";

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, error, ...rest }, ref) => (
    <div className="space-y-1 w-full">
      <textarea
        ref={ref}
        className={cn(
          "w-full bg-surface border border-border px-4 py-3 text-sm text-foreground rounded-sm focus:border-primary outline-none transition-all duration-300 resize-none placeholder:text-text-muted/50 font-mono",
          error && "border-danger danger-glow",
          className
        )}
        {...rest}
      />
      {error && <p className="text-xs text-danger font-mono mt-1">{error}</p>}
    </div>
  )
);
TextArea.displayName = "TextArea";

function Checkbox({
  id,
  checked,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (c: boolean) => void;
}) {
  return (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="h-5 w-5 border border-border data-[state=checked]:border-primary transition-all duration-300 bg-surface flex items-center justify-center group/cb hover:border-primary rounded"
    >
      <CheckboxPrimitive.Indicator>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-2.5 h-2.5 bg-primary gold-glow rounded-sm"
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

// ── Constants ────────────────────────────────────────────────────────────────────

const DISCOUNT_TYPES = [
  { value: "percentage", label: "Percentage (%)" },
  { value: "fixed", label: "Fixed Amount (₹)" },
];

const APPLIES_TO = [
  { value: "all", label: "All Items" },
  { value: "courses", label: "Courses Only" },
  { value: "paintings", label: "Paintings Only" },
  { value: "selected_courses", label: "Selected Courses" },
  { value: "selected_paintings", label: "Selected Paintings" },
];

const RESTRICTION_TYPES = [
  { value: "all_eligible", label: "All Eligible Items" },
  { value: "selected_products", label: "Selected Products Only" },
];

// ── Main form ────────────────────────────────────────────────────────────────────

export function CouponForm({
  initialData,
  onSubmit,
  isSubmitting,
}: CouponFormProps) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CouponSchemaValues>({
    resolver: zodResolver(couponSchema) as Resolver<CouponSchemaValues>,
    defaultValues: {
      code: initialData?.code ?? "",
      description: initialData?.description ?? "",
      discount_type: (initialData?.discount_type ?? "percentage") as "percentage" | "fixed",
      discount_value: initialData?.discount_value ?? 0,
      max_discount: initialData?.max_discount ?? null,
      applies_to: (initialData?.applies_to ?? "all") as "all" | "courses" | "paintings" | "selected_courses" | "selected_paintings",
      restriction_type: (initialData?.restriction_type ?? "all_eligible") as "all_eligible" | "selected_products",
      min_order_amount: initialData?.min_order_amount ?? 0,
      usage_limit: initialData?.usage_limit ?? null,
      per_user_limit: initialData?.per_user_limit ?? 1,
      starts_at: initialData?.starts_at
        ? new Date(initialData.starts_at).toISOString().slice(0, 16)
        : "",
      expires_at: initialData?.expires_at
        ? new Date(initialData.expires_at).toISOString().slice(0, 16)
        : "",
      is_active: initialData?.is_active ?? true,
      course_ids: (initialData?.course_ids ?? []).map((id) => ({ value: id })),
      painting_ids: (initialData?.painting_ids ?? []).map((id) => ({ value: id })),
    },
  });

  const [showCourseSelector, setShowCourseSelector] = useState(false);
  const [showPaintingSelector, setShowPaintingSelector] = useState(false);
  const [courseSearch, setCourseSearch] = useState("");
  const [paintingSearch, setPaintingSearch] = useState("");
  const [courses, setCourses] = useState<Array<{ id: string; title: string }>>([]);
  const [paintings, setPaintings] = useState<Array<{ id: string; title: string }>>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isLoadingPaintings, setIsLoadingPaintings] = useState(false);
  const [courseError, setCourseError] = useState<string | null>(null);
  const [paintingError, setPaintingError] = useState<string | null>(null);

  // Fetch courses when selector opens
  useEffect(() => {
    if (showCourseSelector && courses.length === 0) {
      setIsLoadingCourses(true);
      setCourseError(null);
      fetchAllCourses()
        .then(setCourses)
        .catch((err) => setCourseError(err.message || "Failed to load courses"))
        .finally(() => setIsLoadingCourses(false));
    }
  }, [showCourseSelector, courses.length]);

  // Fetch paintings when selector opens
  useEffect(() => {
    if (showPaintingSelector && paintings.length === 0) {
      setIsLoadingPaintings(true);
      setPaintingError(null);
      fetchAllPaintings()
        .then(setPaintings)
        .catch((err) => setPaintingError(err.message || "Failed to load paintings"))
        .finally(() => setIsLoadingPaintings(false));
    }
  }, [showPaintingSelector, paintings.length]);

  const showCourseIds = watch("applies_to") === "selected_courses";
  const showPaintingIds = watch("applies_to") === "selected_paintings";

  const learnFields = useFieldArray({
    control,
    name: "course_ids",
  });

  const reqFields = useFieldArray({
    control,
    name: "painting_ids",
  });

  const isEdit = !!initialData;

  const handleFormSubmit = (values: CouponSchemaValues) => {
    const payload: CouponFormValues = {
      code: values.code.trim().toUpperCase(),
      description: values.description || null,
      discount_type: values.discount_type,
      discount_value: values.discount_value,
      max_discount: values.max_discount ?? null,
      applies_to: values.applies_to,
      restriction_type: values.restriction_type,
      min_order_amount: values.min_order_amount,
      usage_limit: values.usage_limit ?? null,
      per_user_limit: values.per_user_limit,
      starts_at: values.starts_at || null,
      expires_at: values.expires_at || null,
      is_active: values.is_active,
      course_ids: values.course_ids.map((item) => item.value),
      painting_ids: values.painting_ids.map((item) => item.value),
    };
    return onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Coupon Code *</Label>
          <Input
            placeholder="e.g. WELCOME20"
            error={errors.code?.message}
            {...register("code")}
            maxLength={50}
            defaultValue={isEdit ? initialData?.code : undefined}
            disabled={isEdit}
          />
          {isEdit && (
            <p className="text-2xs font-mono text-text-muted">
              Coupon code cannot be changed after creation
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Discount Type *</Label>
          <Controller
            name="discount_type"
            control={control}
            render={({ field }) => (
              <CustomSelect
                placeholder="Select type"
                options={DISCOUNT_TYPES}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Discount Value *</Label>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            placeholder={watch("discount_type") === "percentage" ? "e.g. 20" : "e.g. 500"}
            error={errors.discount_value?.message}
            {...register("discount_value", { valueAsNumber: true })}
          />
          <p className="text-xs text-text-muted">
            {watch("discount_type") === "percentage"
              ? "Percentage off (1-100)"
              : "Fixed amount in INR"}
          </p>
        </div>

        <div className="space-y-2">
          <Label>Max Discount Cap (Optional)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 1000"
            error={errors.max_discount?.message}
            {...register("max_discount", { valueAsNumber: true })}
          />
          <p className="text-xs text-text-muted">Maximum discount cap in INR</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Applies To *</Label>
          <Controller
            name="applies_to"
            control={control}
            render={({ field }) => (
              <CustomSelect
                placeholder="Select scope"
                options={APPLIES_TO}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </div>

        <div className="space-y-2">
          <Label>Restriction Type *</Label>
          <Controller
            name="restriction_type"
            control={control}
            render={({ field }) => (
              <CustomSelect
                placeholder="Select restriction"
                options={RESTRICTION_TYPES}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description (Optional)</Label>
        <TextArea
          placeholder="Brief description of this coupon..."
          rows={3}
          {...register("description")}
        />
      </div>

      {(showCourseIds || showPaintingIds) && (
        <div className="space-y-1.5 pt-4 border-t border-border/50">
          <div className="flex items-center justify-between">
            <Label>{showCourseIds ? "Selected Courses" : "Selected Paintings"}</Label>
            <button
              type="button"
              onClick={() =>
                showCourseIds
                  ? setShowCourseSelector(true)
                  : setShowPaintingSelector(true)
              }
              className="text-xs font-mono uppercase tracking-widest text-primary hover:underline flex items-center gap-1.5"
            >
              <Plus size={12} /> Add {showCourseIds ? "Course" : "Painting"}
            </button>
          </div>

          {showCourseIds && learnFields.fields.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {learnFields.fields.map((field) => {
                return (
                  <span
                    key={field.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/30 rounded-sm text-xs text-green-400"
                  >
                    <span className="font-mono">{field.value.slice(0, 8)}</span>
                    <button
                      type="button"
                      onClick={() => learnFields.remove(learnFields.fields.indexOf(field))}
                      className="text-green-400 hover:text-red-400 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {showPaintingIds && reqFields.fields.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {reqFields.fields.map((field) => {
                return (
                  <span
                    key={field.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-sm text-xs text-blue-400"
                  >
                    <span className="font-mono">{field.value.slice(0, 8)}</span>
                    <button
                      type="button"
                      onClick={() => reqFields.remove(reqFields.fields.indexOf(field))}
                      className="text-blue-400 hover:text-red-400 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {(learnFields.fields.length === 0 && showCourseIds) ||
          (reqFields.fields.length === 0 && showPaintingIds) ? (
            <p className="text-text-muted text-sm text-center py-4">
              No {showCourseIds ? "courses" : "paintings"} selected. Click "Add" to choose.
            </p>
          ) : null}
        </div>
      )}

      {showCourseSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border/90 rounded-sm shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <h3 className="text-lg font-bold uppercase tracking-widest text-text-main">
                Select Courses
              </h3>
              <button
                onClick={() => setShowCourseSelector(false)}
                className="text-text-muted hover:text-primary transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 border-b border-border/50">
              <input
                type="text"
                placeholder="Search..."
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                className="w-full px-4 py-2 bg-dark border border-border/60 rounded-sm text-text-main placeholder:text-text-muted/40 focus:outline-none focus:border-gold/50"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {isLoadingCourses && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-primary" size={24} />
                  <span className="ml-2 text-text-muted">Loading courses...</span>
                </div>
              )}
              {courseError && (
                <div className="text-center py-8 text-red-400">
                  <p>Error: {courseError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoadingCourses(true);
                      setCourseError(null);
                      fetchAllCourses()
                        .then(setCourses)
                        .catch((err) => setCourseError(err.message || "Failed to load courses"))
                        .finally(() => setIsLoadingCourses(false));
                    }}
                    className="mt-2 text-xs font-mono underline hover:text-primary"
                  >
                    Retry
                  </button>
                </div>
              )}
              {!isLoadingCourses && !courseError && (
                <div>
                  {courses.filter((c) =>
                    c.title.toLowerCase().includes(courseSearch.toLowerCase())
                  ).length === 0 ? (
                    <p className="text-text-muted text-center py-8">
                      No courses found
                    </p>
                  ) : (
                    courses
                      .filter((c) =>
                        c.title.toLowerCase().includes(courseSearch.toLowerCase())
                      )
                      .map((course) => (
                        <label
                          key={course.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-primary/5 transition-colors cursor-pointer rounded-sm"
                        >
                          <input
                            type="checkbox"
                            checked={learnFields.fields.some((f) => f.value === course.id)}
                            onChange={(e) =>
                              e.target.checked
                                ? learnFields.append({ value: course.id })
                                : (() => {
                                    const index = learnFields.fields.findIndex((f) => f.value === course.id);
                                    if (index !== -1) learnFields.remove(index);
                                  })()
                            }
                            className="h-4 w-4 border border-border rounded text-primary focus:ring-primary"
                          />
                          <span className="text-sm text-text-main truncate flex-1">{course.title}</span>
                          <span className="text-2xs font-mono text-text-muted">{course.id.slice(0, 8)}</span>
                        </label>
                      )))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-border/50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCourseSelector(false)}
                className="px-4 py-2 text-xs font-mono uppercase tracking-widest text-text-muted hover:text-primary transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaintingSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border/90 rounded-sm shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <h3 className="text-lg font-bold uppercase tracking-widest text-text-main">
                Select Paintings
              </h3>
              <button
                onClick={() => setShowPaintingSelector(false)}
                className="text-text-muted hover:text-primary transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 border-b border-border/50">
              <input
                type="text"
                placeholder="Search..."
                value={paintingSearch}
                onChange={(e) => setPaintingSearch(e.target.value)}
                className="w-full px-4 py-2 bg-dark border border-border/60 rounded-sm text-text-main placeholder:text-text-muted/40 focus:outline-none focus:border-gold/50"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {isLoadingPaintings && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-primary" size={24} />
                  <span className="ml-2 text-text-muted">Loading paintings...</span>
                </div>
              )}
              {paintingError && (
                <div className="text-center py-8 text-red-400">
                  <p>Error: {paintingError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoadingPaintings(true);
                      setPaintingError(null);
                      fetchAllPaintings()
                        .then(setPaintings)
                        .catch((err) => setPaintingError(err.message || "Failed to load paintings"))
                        .finally(() => setIsLoadingPaintings(false));
                    }}
                    className="mt-2 text-xs font-mono underline hover:text-primary"
                  >
                    Retry
                  </button>
                </div>
              )}
              {!isLoadingPaintings && !paintingError && (
                <div>
                  {paintings.filter((p) =>
                    p.title.toLowerCase().includes(paintingSearch.toLowerCase())
                  ).length === 0 ? (
                    <p className="text-text-muted text-center py-8">
                      No paintings found
                    </p>
                  ) : (
                    paintings
                      .filter((p) =>
                        p.title.toLowerCase().includes(paintingSearch.toLowerCase())
                      )
                      .map((painting) => (
                        <label
                          key={painting.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-primary/5 transition-colors cursor-pointer rounded-sm"
                        >
                          <input
                            type="checkbox"
                            checked={reqFields.fields.some((f) => f.value === painting.id)}
                            onChange={(e) =>
                              e.target.checked
                                ? reqFields.append({ value: painting.id })
                                : (() => {
                                    const index = reqFields.fields.findIndex((f) => f.value === painting.id);
                                    if (index !== -1) reqFields.remove(index);
                                  })()
                            }
                            className="h-4 w-4 border border-border rounded text-primary focus:ring-primary"
                          />
                          <span className="text-sm text-text-main truncate flex-1">{painting.title}</span>
                          <span className="text-2xs font-mono text-text-muted">{painting.id.slice(0, 8)}</span>
                        </label>
                      )))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-border/50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPaintingSelector(false)}
                className="px-4 py-2 text-xs font-mono uppercase tracking-widest text-text-muted hover:text-primary transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="space-y-2">
          <Label>Min Order Amount</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0"
            {...register("min_order_amount", { valueAsNumber: true })}
          />
        </div>

        <div className="space-y-2">
          <Label>Total Usage Limit (Optional)</Label>
          <Input
            type="number"
            min="1"
            placeholder="Unlimited"
            {...register("usage_limit", { valueAsNumber: true })}
          />
          <p className="text-xs text-text-muted">Leave empty for unlimited</p>
        </div>

        <div className="space-y-2">
          <Label>Per User Limit *</Label>
          <Input
            type="number"
            min="1"
            {...register("per_user_limit", { valueAsNumber: true })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Valid From (Optional)</Label>
          <Input
            type="datetime-local"
            {...register("starts_at")}
          />
        </div>

        <div className="space-y-2">
          <Label>Expires At (Optional)</Label>
          <Input
            type="datetime-local"
            {...register("expires_at")}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Status</Label>
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <Controller
              name="is_active"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="is_active"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <label
              htmlFor="is_active"
              className="text-2xs font-bold uppercase tracking-widest cursor-pointer hover:text-primary transition-colors text-foreground"
            >
              Active
            </label>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t border-border">
        <GhostBtn
          type="button"
          onClick={() => window.history.back()}
          className="px-8 py-3.5 text-xs"
        >
          Cancel
        </GhostBtn>
        <PrimaryBtn
          type="submit"
          disabled={isSubmitting}
          className="px-6 md:px-12 py-3 md:py-3.5 gold-glow-lg"
        >
          {isSubmitting ? (
            <div className="luxury-loader luxury-loader-dark loader-sm" />
          ) : isEdit ? (
            <div>
              <Save size={14} /> Update Coupon
            </div>
          ) : (
            <div>
              <Plus size={14} /> Create Coupon
            </div>
          )}
        </PrimaryBtn>
      </div>
    </form>
  );
}