"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Plus, Search, RefreshCw, Edit, Trash2, Eye } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { PrimaryBtn, GhostBtn } from "@/components/ui/buttons";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatusModal } from "@/components/ui/StatusModal";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  listAdminCoupons,
  deleteAdminCoupon,
  type AdminCouponListRead,
} from "@/api/admin-coupons";

interface CouponFilters {
  is_active: string;
  applies_to: string;
}

const EMPTY_FILTERS: CouponFilters = { is_active: "all", applies_to: "all" };
const APPLIES_TO_OPTIONS = ["all", "courses", "paintings", "selected_courses", "selected_paintings"];

export default function AdminCouponsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<CouponFilters>(EMPTY_FILTERS);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin-coupons", page, pageSize, search, filters.is_active, filters.applies_to],
    queryFn: () =>
      listAdminCoupons({
        page,
        page_size: pageSize,
        search,
        is_active: filters.is_active === "all" ? undefined : filters.is_active === "true",
        applies_to: filters.applies_to === "all" ? undefined : filters.applies_to,
      }),
  });

  const coupons = data?.data ?? [];
  const pagination = data?.pagination;
  const isDataLoading = isLoading || isFetching;

  const deleteMutation = useMutation({
    mutationFn: deleteAdminCoupon,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      toast.success("Coupon deactivated");
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const columns: ColumnDef<AdminCouponListRead>[] = useMemo(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => (
          <Link
            href={`/admin/coupons/${row.original.id}`}
            className="font-mono text-text-main hover:text-primary transition-colors font-medium"
          >
            {row.getValue("code")}
          </Link>
        ),
      },
      {
        accessorKey: "discount_type",
        header: "Type",
        cell: ({ row }) => {
          const { discount_type: type, discount_value: value, max_discount: max } = row.original;
          return (
            <span className="text-sm">
              {type === "percentage" ? `${value}%` : `₹${value}`}
              {max && <span className="text-text-muted ml-1">(max ₹{max})</span>}
            </span>
          );
        },
      },
      {
        accessorKey: "applies_to",
        header: "Applies To",
        cell: ({ row }) => (
          <span className="capitalize text-sm text-text-muted">
            {(row.getValue("applies_to") as string).replace(/_/g, " ")}
          </span>
        ),
      },
      {
        accessorKey: "usage_count",
        header: "Usage",
        cell: ({ row }) => {
          const used = row.getValue("usage_count") as number;
          const limit = row.getValue("usage_limit") as number | null;
          return (
            <span className="font-mono text-sm">
              {used} / {limit ?? "∞"}
            </span>
          );
        },
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => {
          const isActive = row.getValue("is_active") as boolean;
          return (
            <span
              className={cn(
                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                isActive
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              )}
            >
              {isActive ? "Active" : "Inactive"}
            </span>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) =>
          new Date(row.getValue("created_at") as string).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
      },
      {
        accessorKey: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const coupon = row.original;
          return (
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/coupons/${coupon.id}`}
                className="p-2 text-text-muted hover:text-primary transition-colors"
                title="View Details"
              >
                <Eye size={16} />
              </Link>
              <Link
                href={`/admin/coupons/${coupon.id}/edit`}
                className="p-2 text-text-muted hover:text-primary transition-colors"
                title="Edit"
              >
                <Edit size={16} />
              </Link>
              {!coupon.is_active ? (
                <span className="p-2 text-text-muted/40" title="Already inactive">
                  <Trash2 size={16} />
                </span>
              ) : (
                <button
                  onClick={() => setDeleteTarget(coupon.id)}
                  className="p-2 text-text-muted hover:text-red-400 transition-colors"
                  title="Deactivate"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          );
        },
      },
    ],
    []
  );

  return (
    <div className="pt-8 pb-12 px-6 lg:px-12">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Coupons</h1>
            <p className="text-text-muted mt-1">Manage promotional coupons and discounts</p>
          </div>
          <Link href="/admin/coupons/new">
            <PrimaryBtn className="text-xs py-2 px-4">
              <Plus size={14} className="mr-1.5" />
              Create Coupon
            </PrimaryBtn>
          </Link>
        </div>

        <div className="bg-surface/30 border border-border/90 rounded-sm overflow-hidden">
          <div className="p-4 border-b border-border/90 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/40" size={18} />
              <input
                type="text"
                placeholder="Search coupons..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-10 pr-4 py-2 bg-dark border border-border/60 rounded-sm text-text-main placeholder:text-text-muted/40 focus:outline-none focus:border-gold/50"
              />
            </div>

            <div className="flex items-center gap-3">
              <CustomSelect
                value={filters.is_active}
                onChange={(v) => { setFilters((prev) => ({ ...prev, is_active: v as "all" | "true" | "false" })); setPage(1); }}
                options={[
                  { value: "all", label: "All Status" },
                  { value: "true", label: "Active" },
                  { value: "false", label: "Inactive" },
                ]}
                placeholder="Filter by status"
                className="w-40"
              />
              <CustomSelect
                value={filters.applies_to}
                onChange={(v) => { setFilters((prev) => ({ ...prev, applies_to: v as "all" | "courses" | "paintings" | "selected_courses" | "selected_paintings" })); setPage(1); }}
                options={APPLIES_TO_OPTIONS.map((v) => ({ value: v, label: v.replace(/_/g, " ") }))}
                placeholder="Applies to"
                className="w-48"
              />
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-coupons"] })}
                disabled={isDataLoading}
                className="p-2 text-text-muted hover:text-primary transition-colors border border-border/60 rounded-sm"
                title="Refresh"
              >
                <RefreshCw size={18} className={isDataLoading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {error ? (
            <div className="p-6 text-center space-y-3">
              <p className="text-sm text-danger">Failed to load coupons: {(error as Error).message}</p>
              <GhostBtn onClick={() => refetch()} className="text-xs py-1.5 px-3">Retry</GhostBtn>
            </div>
          ) : <div className="overflow-x-auto">
            <DataTable
              columns={columns}
              data={coupons}
              isLoading={isDataLoading}
            />
          </div>}

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between px-4 py-4 border-t border-border/50">
              <div className="text-sm text-text-muted">
                Page {page} of {pagination.total_pages} ({pagination.total_items} items)
              </div>
              <div className="flex items-center gap-2">
                <GhostBtn
                  className="text-xs py-1.5 px-3"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </GhostBtn>
                <GhostBtn
                  className="text-xs py-1.5 px-3"
                  onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                  disabled={page === pagination.total_pages}
                >
                  Next
                </GhostBtn>
              </div>
            </div>
          )}
        </div>

        <StatusModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          type="warning"
          title="Deactivate Coupon"
          message="Are you sure you want to deactivate this coupon? This action cannot be undone."
          actionText="DEACTIVATE"
          onAction={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        />
      </div>
    </div>
  );
}
