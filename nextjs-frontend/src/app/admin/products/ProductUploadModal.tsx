"use client";

import { unwrap, unwrapPaginated } from "@/api/client-service";
import {
  createProduct,
  DimensionUnit,
  listCategories,
  listMediums,
  listVariantTypes,
  ProductCategoryRead,
  ProductDetailRead,
  ProductImageState,
  ProductMediumRead,
  ProductStatus,
  updateProduct,
  VariantTypeRead,
} from "@/api/openapi-client";
import {
  QuickAddEntityModal,
  type QuickAddEntityType,
} from "@/components/admin/QuickAddEntityModal";
import { PrimaryBtn } from "@/components/ui/buttons";
import { Checkbox } from "@/components/ui/checkbox";
import { CustomSelect } from "@/components/ui/custom-select";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage, getValidationErrors } from "@/lib/error-handler";
import { slugify } from "@/lib/slugify";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  Image as ImageIcon,
  Layers,
  Layout,
  Plus,
  Save,
  Settings,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  type FieldErrors,
  type FieldValues,
  type Path,
  type Resolver,
  type UseFormSetError,
} from "react-hook-form";
import { toast } from "@/lib/toast";
import { z } from "zod";

// ─── Constants ────────────────────────────────────────────────────────────────
const PRODUCT_STATUSES: ProductStatus[] = [
  "draft",
  "published",
  "sold_out",
  "archived",
];

const TABS = [
  { value: "general", icon: <Sparkles size={14} />, label: "Essence" },
  { value: "description", icon: <Layout size={14} />, label: "Narrative" },
  { value: "variants", icon: <Layers size={14} />, label: "Formats" },
  { value: "media", icon: <ImageIcon size={14} />, label: "Gallery" },
  { value: "settings", icon: <Settings size={14} />, label: "Meta" },
] as const;

type TabValue = (typeof TABS)[number]["value"];
const TAB_VALUES = TABS.map((t) => t.value) as TabValue[];
const FIRST_TAB = TAB_VALUES[0];
const LAST_TAB = TAB_VALUES[TAB_VALUES.length - 1];

// ─── Zod Schemas ──────────────────────────────────────────────────────────────
const VariantSchema = z.object({
  id: z.string().optional(),
  variant_type_id: z.coerce.number().min(1, "Format type is required"),
  price: z.coerce.number().min(0.01, "Price must be greater than 0"),
  width: z.coerce.number().nullable(),
  height: z.coerce.number().nullable(),
  dimension_unit: z.enum(["cm", "inch", "mm"] as const),
  stock_quantity: z.coerce.number().int().min(0),
  is_default: z.boolean(),
  is_available: z.boolean(),
  sku: z.string(),
});

const ImageStateSchema = z.object({
  id: z.number().optional(),
  image_url: z.string().nullable().optional(),
  file: z.any().optional(), // For new uploads
  file_index: z.number().nullable().optional(),
  alt_text: z.string().nullable().optional(),
  is_primary: z.boolean(),
  sort_order: z.number(),
  is_existing: z.boolean().optional(),
  is_external: z.boolean().optional(),
});

const ProductUploadSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  category_id: z.coerce.number().nullable(),
  medium_id: z.coerce.number().nullable(),
  short_description: z.string(),
  description: z.string(),
  style: z.string(),
  subject: z.string(),
  year_created: z.coerce.number().int().nullable(),
  is_original_available: z.boolean(),
  is_framed: z.boolean(),
  certificate_of_authenticity: z.boolean(),
  weight_grams: z.coerce.number().nullable(),
  is_featured: z.boolean(),
  sort_order: z.number(),
  status: z.enum(["draft", "published", "sold_out", "archived"] as const),
  meta_title: z.string(),
  meta_description: z.string(),
  variants: z.array(VariantSchema).min(1, "At least one format is required"),
  images: z.array(ImageStateSchema).min(1, "At least one image is required"),
});

type ProductUploadFormValues = z.infer<typeof ProductUploadSchema>;

// ─── Utilities ───────────────────────────────────────────────────────────────
function applyBackendErrors<T extends FieldValues>(
  errors: Record<string, string[]>,
  setError: UseFormSetError<T>
) {
  Object.entries(errors).forEach(([field, messages]) => {
    const rhfPath = field
      .replace(/^payload\.product\./, "")
      .replace(/^payload\./, "")
      .replace(/\[(\d+)\]/g, ".$1") as Path<T>;

    setError(rhfPath, {
      type: "server",
      message: messages[0],
    });
  });
}

function getTabForField(path: string): TabValue {
  const normalizedPath = path
    .replace(/^payload\.product\./, "")
    .replace(/^payload\./, "");

  if (normalizedPath.startsWith("variants")) return "variants";
  if (normalizedPath.startsWith("images")) return "media";

  const generalFields = [
    "title",
    "slug",
    "category_id",
    "medium_id",
    "year_created",
    "status",
    "is_featured",
  ];
  const descFields = ["short_description", "description"];
  const settingFields = [
    "meta_title",
    "meta_description",
    "is_original_available",
    "is_framed",
    "certificate_of_authenticity",
    "weight_grams",
  ];

  if (generalFields.some((f) => normalizedPath.startsWith(f))) return "general";
  if (descFields.some((f) => normalizedPath.startsWith(f)))
    return "description";
  if (settingFields.some((f) => normalizedPath.startsWith(f)))
    return "settings";

  return "general";
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ProductUploadModal({
  isOpen,
  onClose,
  onSuccess,
  product,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  product?: ProductDetailRead | null;
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    setError,
    setFocus,
    trigger,
    formState: { errors },
  } = useForm<ProductUploadFormValues>({
    resolver: zodResolver(
      ProductUploadSchema
    ) as Resolver<ProductUploadFormValues>,
    mode: "onSubmit",
    defaultValues: {
      title: "",
      slug: "",
      category_id: null,
      medium_id: null,
      short_description: "",
      description: "",
      style: "",
      subject: "",
      year_created: null,
      is_original_available: false,
      is_framed: false,
      certificate_of_authenticity: false,
      weight_grams: null,
      is_featured: false,
      sort_order: 0,
      status: "draft",
      meta_title: "",
      meta_description: "",
      variants: [
        {
          variant_type_id: 0,
          price: 0,
          width: null,
          height: null,
          dimension_unit: "cm",
          stock_quantity: 0,
          is_default: true,
          is_available: true,
          sku: "",
        },
      ],
      images: [],
    },
  });

  const {
    fields: variantFields,
    append: appendVariant,
    remove: removeVariant,
  } = useFieldArray({ control, name: "variants" });

  const {
    fields: imageFields,
    append: appendImage,
    remove: removeImage,
  } = useFieldArray({ control, name: "images" });

  const [categories, setCategories] = useState<ProductCategoryRead[]>([]);
  const [mediums, setMediums] = useState<ProductMediumRead[]>([]);
  const [variantTypes, setVariantTypes] = useState<VariantTypeRead[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>(FIRST_TAB);
  const [isSlugManuallyModified, setIsSlugManuallyModified] = useState(false);

  const [quickAddFor, setQuickAddFor] = useState<QuickAddEntityType | null>(
    null
  );
  const [quickAddVariantIndex, setQuickAddVariantIndex] = useState(0);

  const watchedTitle = watch("title");

  const validateTab = async (tab: TabValue): Promise<boolean> => {
    if (tab === "general") {
      return await trigger(["title", "slug"]);
    }
    if (tab === "variants") {
      return await trigger("variants");
    }
    if (tab === "media") {
      const isValid = await trigger("images");
      if (!isValid) {
        toast.error(
          "Gallery requires at least one image with a primary selection"
        );
      }
      return isValid;
    }
    return true;
  };

  const handleTabChange = async (value: string) => {
    const targetTab = value as TabValue;
    const currentIndex = TAB_VALUES.indexOf(activeTab);
    const targetIndex = TAB_VALUES.indexOf(targetTab);

    if (targetIndex > currentIndex) {
      for (let i = currentIndex; i < targetIndex; i++) {
        const isValid = await validateTab(TAB_VALUES[i]);
        if (!isValid) return;
      }
    }
    setActiveTab(targetTab);
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        setFocus("title");
      }, 100);
    }
  }, [isOpen, setFocus]);

  const goNext = async () => {
    if (await validateTab(activeTab)) {
      const idx = TAB_VALUES.indexOf(activeTab);
      if (idx < TAB_VALUES.length - 1) setActiveTab(TAB_VALUES[idx + 1]);
    }
  };
  const goPrev = () => {
    const idx = TAB_VALUES.indexOf(activeTab);
    if (idx > 0) setActiveTab(TAB_VALUES[idx - 1]);
  };

  const isFirstTab = activeTab === FIRST_TAB;
  const isLastTab = activeTab === LAST_TAB;

  const resetForm = useCallback(() => {
    reset({
      title: "",
      slug: "",
      category_id: null,
      medium_id: null,
      short_description: "",
      description: "",
      style: "",
      subject: "",
      year_created: null,
      is_original_available: false,
      is_framed: false,
      certificate_of_authenticity: false,
      weight_grams: null,
      is_featured: false,
      sort_order: 0,
      status: "draft",
      meta_title: "",
      meta_description: "",
      variants: [
        {
          variant_type_id: 0,
          price: 0,
          width: null,
          height: null,
          dimension_unit: "cm",
          stock_quantity: 0,
          is_default: true,
          is_available: true,
          sku: "",
        },
      ],
      images: [],
    });
    setIsSlugManuallyModified(false);
    setActiveTab(FIRST_TAB);
  }, [reset]);

  useEffect(() => {
    if (!isSlugManuallyModified && !product) {
      setValue("slug", watchedTitle ? slugify(watchedTitle) : "", {
        shouldValidate: true,
      });
    }
  }, [watchedTitle, isSlugManuallyModified, product, setValue]);

  const fetchMetadata = useCallback(async () => {
    const [c, m, vt] = await Promise.all([
      unwrapPaginated(listCategories()),
      unwrapPaginated(listMediums()),
      unwrapPaginated(listVariantTypes()),
    ]);
    setCategories(c.data);
    setMediums(m.data);
    setVariantTypes(vt.data);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetchMetadata();
    if (product) {
      reset({
        title: product.title,
        slug: product.slug,
        category_id: product.category?.id ?? null,
        medium_id: product.medium?.id ?? null,
        short_description: product.short_description || "",
        description: product.description || "",
        style: product.style || "",
        subject: product.subject || "",
        year_created: product.year_created,
        is_original_available: product.is_original_available,
        is_framed: product.is_framed,
        certificate_of_authenticity: product.certificate_of_authenticity,
        weight_grams: product.weight_grams,
        is_featured: product.is_featured,
        sort_order: product.sort_order,
        status: product.status,
        meta_title: product.meta_title || "",
        meta_description: product.meta_description || "",
        variants:
          product.variants?.map((v) => ({
            id: v.id,
            variant_type_id: v.variant_type_id ?? 0,
            price: Number(v.price),
            width: v.width ? Number(v.width) : null,
            height: v.height ? Number(v.height) : null,
            dimension_unit: (v.dimension_unit as DimensionUnit) || "cm",
            stock_quantity: v.stock_quantity,
            is_default: v.is_default,
            is_available: v.is_available,
            sku: v.sku || "",
          })) || [],
        images:
          product.images?.map((img) => ({
            id: img.id,
            image_url: img.image_url,
            is_primary: img.is_primary,
            sort_order: img.sort_order,
            is_existing: true,
          })) || [],
      });
    } else {
      resetForm();
    }
  }, [isOpen, product, resetForm, fetchMetadata, reset]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const MAX_UPLOAD_SIZE = (Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB) || 100) * 1024 * 1024;
    const currentImages = watch("images");
    const hasPrimary = currentImages.some((img) => img.is_primary);

    files.forEach((file, index) => {
      if (file.size > MAX_UPLOAD_SIZE) {
        toast.error("Image must be under " + (Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB) || 100) + "MB");
        return;
      }
      appendImage({
        file,
        image_url: URL.createObjectURL(file),
        is_primary: !hasPrimary && index === 0,
        sort_order: currentImages.length + index,
        is_existing: false,
      });
    });
  };

  const setPrimaryImage = (index: number) => {
    const currentImages = watch("images");
    currentImages.forEach((_, i) => {
      setValue(`images.${i}.is_primary`, i === index, {
        shouldDirty: true,
        shouldValidate: true,
      });
    });
  };

  const handleRemoveImage = (index: number) => {
    const currentImages = watch("images");
    const wasPrimary = currentImages[index]?.is_primary;
    removeImage(index);

    // If we removed the primary image, promote another one
    if (wasPrimary) {
      setTimeout(() => {
        const remaining = watch("images");
        if (remaining.length > 0) {
          setPrimaryImage(0);
        }
      }, 0);
    }
  };

  const handleRemoveVariant = (index: number) => {
    const currentVariants = watch("variants");
    const wasDefault = currentVariants[index]?.is_default;
    removeVariant(index);

    if (wasDefault) {
      setTimeout(() => {
        const remaining = watch("variants");
        if (remaining.length > 0) {
          setValue("variants.0.is_default", true, {
            shouldDirty: true,
            shouldValidate: true,
          });
        }
      }, 0);
    }
  };

  const onSubmit = async (values: ProductUploadFormValues) => {
    setSubmitting(true);
    try {
      const files: File[] = [];
      const imagesPayload = values.images.map((img) => {
        const payloadItem: ProductImageState = {
          id: img.id,
          image_url: img.image_url,
          alt_text: img.alt_text,
          is_primary: img.is_primary,
          sort_order: img.sort_order,
        };

        if (img.file) {
          payloadItem.file_index = files.length;
          files.push(img.file);
        }

        return payloadItem;
      });

      const formattedVariants = values.variants.map((v) => ({
        ...v,
        price: v.price.toString(),
        width: v.width?.toString() || "0.00",
        height: v.height?.toString() || "0.00",
      }));

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { variants: _v, images: _i, ...productFields } = values;
      // const { variants, images, ...productFields } = values;

      const payload = {
        product: productFields,
        variants: formattedVariants,
        images: imagesPayload,
      };

      if (product) {
        await unwrap(
          updateProduct({
            path: { product_id: product.id },
            body: { payload: JSON.stringify(payload), files },
          })
        );
      } else {
        await unwrap(
          createProduct({
            body: { payload: JSON.stringify(payload), files },
          })
        );
      }
      toast.success(product ? "Piece Preserved" : "Piece Added to Archive");
      onSuccess();
    } catch (err: unknown) {
      const validationErrors = getValidationErrors(err);
      if (validationErrors) {
        applyBackendErrors(validationErrors, setError);
        toast.error("Validation failed. Please review the highlighted fields.");
        const firstKey = Object.keys(validationErrors)[0];
        if (firstKey) setActiveTab(getTabForField(firstKey));
      } else {
        toast.error(getErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onInvalid = (errs: FieldErrors<ProductUploadFormValues>) => {
    toast.error("Validation failed. Please review the highlighted fields.");
    const firstErrorField = Object.keys(errs)[0];
    if (firstErrorField) setActiveTab(getTabForField(firstErrorField));
  };

  const watchedImages = watch("images");
  const watchedVariants = watch("variants");

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          key="modal-outer-wrapper"
          className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4"
        >
          <motion.div
            key="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/95 backdrop-blur-sm"
          />
          <motion.div
            key="modal-content-wrapper"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="relative w-full h-full md:h-auto md:max-w-5xl bg-surface border border-border shadow-lg flex flex-col md:max-h-[90vh] overflow-hidden card-luxury rounded"
          >
            {/* Header */}
            <div className="p-4 md:p-6 border-b border-border flex justify-between items-center bg-surface shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 border border-primary/20 flex items-center justify-center bg-gold-bg shrink-0">
                  <Sparkles className="text-primary" size={20} />
                </div>
                <div>
                  <h2 className="text-sm md:text-base font-bold tracking-[0.2em] text-foreground uppercase">
                    {product ? "Curate Piece" : "New Acquisition"}
                  </h2>
                  <p className="hidden md:block text-2xs text-text-muted font-mono tracking-[0.3em] uppercase mt-0.5">
                    Refining the Artist's Legacy
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center hover:bg-gold-bg transition-all rounded-full text-text-muted hover:text-primary"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <Tabs
              value={activeTab}
              onValueChange={handleTabChange}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <TabsList className="bg-surface border-b border-border h-auto p-0 flex overflow-x-auto no-scrollbar shrink-0 w-full justify-start md:justify-around">
                {TABS.map((tab) => (
                  <TabsTrigger
                    key={`tab-trigger-${tab.value}`}
                    value={tab.value}
                    className="flex-1 min-w-[80px] md:min-w-0 gap-1 md:gap-2.5 px-3 md:px-6 py-3 md:py-4 text-2xs md:text-2xs font-mono uppercase border-r border-border last:border-r-0 data-[state=active]:bg-gold-bg data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-b-primary transition-all text-text-muted hover:text-primary whitespace-nowrap"
                  >
                    {tab.icon}{" "}
                    <span className="hidden xs:inline">{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 scrollbar-hide">
                {/* ── General ── */}
                <TabsContent
                  value="general"
                  className="mt-0 space-y-6 md:space-y-8 animate-in fade-in duration-300"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    <div className="space-y-2">
                      <Label>Piece Title</Label>
                      <Input
                        {...register("title")}
                        placeholder="Compelling title..."
                        error={errors.title?.message}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>URL Slug</Label>
                      <Input
                        {...register("slug", {
                          onChange: () => setIsSlugManuallyModified(true),
                        })}
                        error={errors.slug?.message}
                        placeholder="the-masterpiece-slug"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8">
                    <div className="space-y-0">
                      <Label>Collection</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <Controller
                            name="category_id"
                            control={control}
                            render={({ field }) => (
                              <CustomSelect
                                placeholder="Select Collection"
                                options={categories.map((c) => ({
                                  value: c.id,
                                  label: c.name,
                                }))}
                                value={field.value ?? ""}
                                onChange={(val) =>
                                  field.onChange(val ? Number(val) : null)
                                }
                                error={errors.category_id?.message}
                              />
                            )}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setQuickAddFor("category")}
                          className="h-[44px] px-3 border border-border text-2xs bg-surface hover:border-primary transition-colors rounded hover:text-primary shrink-0"
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-0">
                      <Label>Artistic Medium</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <Controller
                            name="medium_id"
                            control={control}
                            render={({ field }) => (
                              <CustomSelect
                                placeholder="Select Medium"
                                options={mediums.map((m) => ({
                                  value: m.id,
                                  label: m.name,
                                }))}
                                value={field.value ?? ""}
                                onChange={(val) =>
                                  field.onChange(val ? Number(val) : null)
                                }
                                error={errors.medium_id?.message}
                              />
                            )}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setQuickAddFor("medium")}
                          className="h-[44px] px-3 border border-border text-2xs bg-surface hover:border-primary transition-colors rounded hover:text-primary shrink-0"
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Year Created</Label>
                      <Input
                        type="number"
                        {...register("year_created")}
                        error={errors.year_created?.message}
                        placeholder={new Date().getFullYear().toString()}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8 pt-2">
                    <div className="space-y-3">
                      <Label>Curatorial Status</Label>
                      <div className="flex flex-wrap gap-2">
                        <Controller
                          name="status"
                          control={control}
                          render={({ field }) => (
                            <>
                              {PRODUCT_STATUSES.map((status: ProductStatus) => (
                                <button
                                  key={`status-btn-${status}`}
                                  type="button"
                                  onClick={() => field.onChange(status)}
                                  className={cn(
                                    "px-3 md:px-4 py-2 text-2xs font-mono uppercase border transition-all duration-300 rounded",
                                    field.value === status
                                      ? "bg-gold border-primary text-dark gold-glow"
                                      : "border-border text-text-muted hover:border-primary hover:text-primary"
                                  )}
                                >
                                  {status.replace("_", " ")}
                                </button>
                              ))}
                            </>
                          )}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 pt-4 sm:pt-6">
                      <Controller
                        name="is_featured"
                        control={control}
                        render={({ field }) => (
                          <Checkbox
                            id="is_featured"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        )}
                      />
                      <label
                        htmlFor="is_featured"
                        className="text-2xs font-bold uppercase tracking-widest cursor-pointer hover:text-primary transition-colors text-foreground"
                      >
                        Featured Piece
                      </label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent
                  value="description"
                  className="mt-0 space-y-6 md:space-y-8 animate-in fade-in duration-300"
                >
                  <div className="space-y-2">
                    <Label>Short Description</Label>
                    <TextArea
                      {...register("short_description")}
                      placeholder="A concise, poetic summary for listings..."
                      rows={3}
                      error={errors.short_description?.message}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Full Narrative</Label>
                    <TextArea
                      {...register("description")}
                      placeholder="Detail the inspiration, technical process, and narrative depth..."
                      rows={6}
                      md-rows={10}
                      error={errors.description?.message}
                      className="min-h-37.5"
                    />
                  </div>
                </TabsContent>

                <TabsContent
                  value="variants"
                  className="mt-0 space-y-6 md:space-y-8 animate-in fade-in duration-300"
                >
                  <div className="flex justify-between items-center pb-4 border-b border-border">
                    <h3 className="text-sm md:text-lg font-bold uppercase tracking-tight text-foreground">
                      Valuation & Dimensions
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        appendVariant({
                          variant_type_id: 0,
                          price: 0,
                          width: null,
                          height: null,
                          dimension_unit: "cm",
                          stock_quantity: 0,
                          is_default: variantFields.length === 0,
                          is_available: true,
                          sku: "",
                        })
                      }
                      className="text-primary flex items-center gap-1.5 md:gap-2.5 text-2xs uppercase tracking-widest hover:text-foreground transition-colors group"
                    >
                      <div className="w-5 h-5 md:w-6 md:h-6 border border-primary/40 flex items-center justify-center group-hover:border-primary transition-colors">
                        <Plus size={10} />
                      </div>
                      Add Format
                    </button>
                  </div>
                  {variantFields.map((field, index) => (
                    <div
                      key={`variant-card-${field.id}`}
                      className="p-4 md:p-6 card-luxury-hover space-y-4 md:space-y-6 relative group/v rounded"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                        <div className="space-y-0">
                          <Label>Format</Label>
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 min-w-0">
                              <Controller
                                name={`variants.${index}.variant_type_id`}
                                control={control}
                                render={({ field: f }) => (
                                  <CustomSelect
                                    placeholder="Format"
                                    options={variantTypes.map((vt) => ({
                                      value: vt.id,
                                      label: vt.name,
                                    }))}
                                    value={f.value}
                                    onChange={(val) => f.onChange(Number(val))}
                                    error={
                                      errors.variants?.[index]?.variant_type_id
                                        ?.message
                                    }
                                  />
                                )}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setQuickAddVariantIndex(index);
                                setQuickAddFor("variantType");
                              }}
                              className="h-[44px] px-3 border border-border text-2xs bg-surface hover:border-primary transition-colors rounded hover:text-primary shrink-0"
                            >
                              <Plus size={11} />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label>Price (₹)</Label>
                          <Input
                            type="number"
                            step="1.00"
                            {...register(`variants.${index}.price`)}
                            error={errors.variants?.[index]?.price?.message}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Width</Label>
                          <Input
                            type="number"
                            step="0.01"
                            {...register(`variants.${index}.width`)}
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Height</Label>
                          <Input
                            type="number"
                            step="0.01"
                            {...register(`variants.${index}.height`)}
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2">
                        <div className="flex flex-wrap items-end gap-4 w-full sm:w-auto">
                          <Controller
                            name={`variants.${index}.dimension_unit`}
                            control={control}
                            render={({ field: f }) => (
                              <CustomSelect
                                label="Unit"
                                placeholder="Unit"
                                options={[
                                  { value: "cm", label: "cm" },
                                  { value: "inch", label: "inch" },
                                  { value: "mm", label: "mm" },
                                ]}
                                value={f.value}
                                onChange={f.onChange}
                                className="w-24 sm:w-28"
                              />
                            )}
                          />
                          <div className="space-y-2 w-24 sm:w-28">
                            <Label>Stock</Label>
                            <Input
                              type="number"
                              {...register(`variants.${index}.stock_quantity`)}
                            />
                          </div>
                          <div className="flex items-center h-[44px] pl-2">
                            <Checkbox
                              id={`def-${index}`}
                              checked={watchedVariants[index]?.is_default}
                              onCheckedChange={() => {
                                watchedVariants.forEach((_, i) =>
                                  setValue(
                                    `variants.${i}.is_default`,
                                    i === index,
                                    { shouldDirty: true, shouldValidate: true }
                                  )
                                );
                              }}
                            />
                            <label
                              htmlFor={`def-${index}`}
                              className="text-2xs uppercase text-text-muted cursor-pointer hover:text-primary transition-colors ml-2 font-mono"
                            >
                              Default
                            </label>
                          </div>
                        </div>
                        <div className="flex items-center justify-end sm:h-[44px]">
                          {variantFields.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveVariant(index)}
                              className="w-9 h-9 flex items-center justify-center text-danger/60 hover:text-danger hover:bg-danger/5 transition-all rounded-full border border-transparent hover:border-danger/20"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent
                  value="media"
                  className="mt-0 space-y-8 md:space-y-10 animate-in fade-in duration-300"
                >
                  {errors.images?.message && (
                    <div className="p-4 bg-danger/5 border border-danger/20 rounded-sm">
                      <p className="text-xs text-danger font-mono uppercase tracking-widest">
                        {errors.images.message}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                    {imageFields.map((field, i) => {
                      const img = watchedImages[i];
                      if (!img) return null;
                      return (
                        <div
                          key={`image-grid-item-${field.id}`}
                          className={cn(
                            "relative aspect-4/5 border group overflow-hidden bg-surface rounded-md transition-all duration-300",
                            img.is_primary
                              ? "border-primary border-2 shadow-[0_0_15px_rgba(212,175,55,0.3)]"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          <ImageWithFallback
                            src={img.image_url}
                            alt=""
                            unoptimized
                            fill
                            className="object-cover"
                          />

                          <div className="absolute inset-0 bg-surface/80 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-3 transition-all duration-300 backdrop-blur-sm">
                            <button
                              type="button"
                              onClick={() => setPrimaryImage(i)}
                              className={cn(
                                "w-10 h-10 flex items-center justify-center rounded-full transition-all",
                                img.is_primary
                                  ? "bg-gold text-dark gold-glow"
                                  : "bg-surface text-foreground hover:text-primary border border-border"
                              )}
                            >
                              <Star
                                size={16}
                                fill={img.is_primary ? "currentColor" : "none"}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(i)}
                              className="w-10 h-10 flex items-center justify-center bg-danger text-white rounded-full hover:bg-danger/80 transition-all danger-glow"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <label className="aspect-4/5 border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-gold-bg transition-all rounded-md group">
                      <Plus
                        size={20}
                        className="text-text-muted group-hover:text-primary transition-colors"
                      />
                      <span className="text-2xs uppercase tracking-widest mt-2 font-mono text-text-muted group-hover:text-primary transition-colors">
                        Upload
                      </span>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageChange}
                      />
                    </label>
                  </div>

                  <div className="space-y-4 md:space-y-6 pt-6 border-t border-border">
                    <h4 className="text-2xs font-bold text-primary uppercase tracking-widest">
                      External Visions
                    </h4>
                    <div className="grid grid-cols-1 gap-4">
                      {imageFields.map((field, i) => {
                        const img = watchedImages[i];
                        if (!img || !img.is_external) return null;
                        return (
                          <div
                            key={`external-vision-${field.id}`}
                            className="flex flex-col sm:flex-row gap-4 p-4 card-luxury group hover:border-primary transition-all rounded"
                          >
                            <div className="flex-1 w-full space-y-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                  <Label>Piece URL</Label>
                                  <Input
                                    {...register(`images.${i}.image_url`)}
                                    error={
                                      errors.images?.[i]?.image_url?.message
                                    }
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Alt Narrative</Label>
                                  <Input
                                    {...register(`images.${i}.alt_text`)}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 pt-2 sm:pt-0 self-end sm:self-center">
                              <button
                                type="button"
                                onClick={() => setPrimaryImage(i)}
                                className={cn(
                                  "px-3 py-1.5 rounded border text-2xs uppercase tracking-widest transition-all font-mono",
                                  img.is_primary
                                    ? "bg-gold border-primary text-dark gold-glow"
                                    : "border-border text-text-muted hover:border-primary hover:text-primary"
                                )}
                              >
                                Principal
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveImage(i)}
                                className="w-9 h-9 flex items-center justify-center text-danger/60 hover:text-danger hover:bg-danger/5 transition-all rounded-full"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      appendImage({
                        image_url: "",
                        alt_text: "",
                        is_primary: imageFields.length === 0,
                        sort_order: imageFields.length,
                        is_external: true,
                        is_existing: false,
                      })
                    }
                    className="text-primary text-2xs uppercase tracking-[0.2em] font-bold hover:text-foreground transition-all flex items-center gap-2 group pt-2"
                  >
                    <Plus
                      size={14}
                      className="group-hover:scale-110 transition-transform"
                    />
                    Add External Vision
                  </button>
                </TabsContent>

                <TabsContent
                  value="settings"
                  className="mt-0 space-y-8 md:space-y-12 animate-in fade-in duration-300"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-16">
                    <div className="space-y-6 md:space-y-8">
                      <h4 className="text-2xs font-bold text-primary uppercase tracking-[0.3em] border-b border-primary/20 pb-2">
                        Tangible Detail
                      </h4>
                      <div className="space-y-4 md:space-y-6">
                        <Controller
                          name="is_original_available"
                          control={control}
                          render={({ field }) => (
                            <SwitchField
                              label="Original Available"
                              checked={field.value}
                              onChange={field.onChange}
                            />
                          )}
                        />
                        <Controller
                          name="is_framed"
                          control={control}
                          render={({ field }) => (
                            <SwitchField
                              label="Framing Included"
                              checked={field.value}
                              onChange={field.onChange}
                            />
                          )}
                        />
                        <Controller
                          name="certificate_of_authenticity"
                          control={control}
                          render={({ field }) => (
                            <SwitchField
                              label="Authenticity Certificate"
                              checked={field.value}
                              onChange={field.onChange}
                            />
                          )}
                        />
                        <div className="pt-2">
                          <Label>Total Mass (Grams)</Label>
                          <Input
                            type="number"
                            {...register("weight_grams")}
                            error={errors.weight_grams?.message}
                            placeholder="e.g. 1500"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-6 md:space-y-8">
                      <h4 className="text-2xs font-bold text-primary uppercase tracking-[0.3em] border-b border-primary/20 pb-2">
                        Archival Metadata
                      </h4>
                      <div className="space-y-4 md:space-y-6">
                        <div className="space-y-2">
                          <Label>Search Title</Label>
                          <Input
                            {...register("meta_title")}
                            placeholder="Curated title for listings..."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Archival Summary</Label>
                          <TextArea
                            {...register("meta_description")}
                            rows={4}
                            md-rows={6}
                            placeholder="Detailed summary for the digital archive..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </div>

              {/* Footer */}
              <div className="p-4 md:p-6 border-t border-border bg-surface flex justify-between items-center shrink-0 backdrop-blur-md">
                {!isFirstTab ? (
                  <button
                    type="button"
                    onClick={goPrev}
                    className="text-2xs font-mono uppercase tracking-[0.3em] text-text-muted hover:text-primary transition-all flex items-center gap-1.5 md:gap-3"
                  >
                    <ChevronLeft size={16} />{" "}
                    <span className="hidden xs:inline">Preceding</span>
                  </button>
                ) : (
                  <div className="w-10" />
                )}
                <div className="flex gap-4 md:gap-6 items-center">
                  <button
                    type="button"
                    onClick={onClose}
                    className="hidden sm:block text-2xs font-mono tracking-[0.3em] uppercase text-text-muted hover:text-primary transition-colors"
                  >
                    Dismiss
                  </button>
                  {!isLastTab ? (
                    <PrimaryBtn
                      type="button"
                      onClick={goNext}
                      className="px-6 md:px-12 py-3 md:py-3.5 text-2xs"
                    >
                      Proceed
                    </PrimaryBtn>
                  ) : (
                    <PrimaryBtn
                      type="button"
                      disabled={submitting}
                      onClick={handleSubmit(onSubmit, onInvalid)}
                      className="w-full px-6 md:px-12 py-3 md:py-3.5 text-2xs gold-glow-lg"
                    >
                      {submitting ? (
                        <div className="luxury-loader luxury-loader-dark scale-75" />
                      ) : (
                        <span className="flex items-center gap-2">
                          <Save size={14} />
                          {product ? "Preserve" : "Archive"}
                        </span>
                      )}
                    </PrimaryBtn>
                  )}
                </div>
              </div>
            </Tabs>
            <QuickAddEntityModal
              isOpen={quickAddFor !== null}
              entityType={quickAddFor || "category"}
              onClose={() => setQuickAddFor(null)}
              onCreated={(e) => {
                const now = new Date().toISOString();
                if (quickAddFor === "category") {
                  setCategories((p) => [
                    ...p,
                    {
                      id: e.id,
                      name: e.name,
                      slug: e.slug,
                      description: null,
                      is_active: true,
                      created_at: now,
                      updated_at: now,
                    },
                  ]);
                  setValue("category_id", e.id);
                } else if (quickAddFor === "medium") {
                  setMediums((p) => [
                    ...p,
                    {
                      id: e.id,
                      name: e.name,
                      slug: e.slug,
                      is_active: true,
                      created_at: now,
                      updated_at: now,
                    },
                  ]);
                  setValue("medium_id", e.id);
                } else if (quickAddFor === "variantType") {
                  setVariantTypes((p) => [
                    ...p,
                    {
                      id: e.id,
                      name: e.name,
                      slug: e.slug,
                      description: null,
                      is_active: true,
                      created_at: now,
                      updated_at: now,
                    },
                  ]);
                  setValue(
                    `variants.${quickAddVariantIndex}.variant_type_id`,
                    e.id
                  );
                }
                setQuickAddFor(null);
              }}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ─── Local UI ────────────────────────────────────────────────────────────────
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
          "w-full bg-surface border border-border px-4 py-3 text-sm text-foreground rounded-sm focus:border-primary outline-none transition-all duration-300 placeholder:text-text-muted/50",
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
          "w-full bg-surface border border-border px-4 py-3 text-sm text-foreground rounded-sm focus:border-primary outline-none transition-all duration-300 resize-none placeholder:text-text-muted/50",
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

function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <div className="space-y-2 group flex items-center justify-between">
      <Label className="group-hover:text-primary transition-colors duration-300 mb-0">
        {label}
      </Label>
      <div className="flex items-center h-[44px]">
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={cn(
            "w-10 h-5 rounded-full relative transition-all duration-500 border",
            checked
              ? "bg-gold/20 border-primary gold-glow"
              : "bg-surface border-text-muted/50 hover:border-primary"
          )}
        >
          <motion.div
            animate={{ x: checked ? 27 : 4 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={cn(
              "absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all duration-300",
              checked ? "bg-gold gold-glow" : "bg-text-muted"
            )}
          />
        </button>
      </div>
    </div>
  );
}
