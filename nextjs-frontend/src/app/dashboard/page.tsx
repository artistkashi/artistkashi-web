"use client";

export const dynamic = 'force-dynamic';

import { GhostBtn, PrimaryBtn } from "@/components/ui/buttons";

import { cn, displayPrice } from "@/lib/utils";
import { format } from "date-fns";
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  Camera,
  Check,
  Clock,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Package,
  Settings,
  Shield,
  ShoppingBag,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GoogleLoginButton } from "@/components/auth/google-login-button";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";

import { unwrap, unwrapVoid } from "@/api/client-service";
import type {
  BodyUsersUpdateOwnProfile,
  CourseListRead,
  OrderRead,
} from "@/api/openapi-client";
import {
  coursesListCourses,
  listMyEnrollments,
  listMyOrders,
  updateOwnProfile,
} from "@/api/openapi-client";
import { AuthGuard } from "@/components/shared/AuthGuard";
import { useAuth } from "@/lib/auth-store";
import { profileSchema, type ProfileFormValues } from "@/lib/auth-validation";
import { getErrorMessage } from "@/lib/error-handler";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "@/lib/toast";

import { AddressManager } from "@/components/dashboard/AddressManager";
import { ContinueWatching } from "@/components/dashboard/ContinueWatching";
import { CourseCard } from "@/components/dashboard/CourseCard";
import { DangerZone } from "@/components/dashboard/DangerZone";
import { ProviderCard } from "@/components/dashboard/ProviderCard";
import { SessionManager } from "@/components/dashboard/SessionManager";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatsCard } from "@/components/dashboard/StatsCard";

function TabInitializer() {
  const searchParams = useSearchParams();
  const [initialTab, setInitialTab] = useState("overview");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "orders" || tab === "courses" || tab === "settings") {
      setInitialTab(tab);
    }
  }, [searchParams]);

  return <DashboardContent initialTab={initialTab} />;
}

function DashboardContent({ initialTab }: { initialTab: string }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [greeting, setGreeting] = useState("Welcome");
  const {
    user,
    logout,
    getAuthProviders,
    setPassword,
    changePassword,
    linkGoogle,
    unlinkGoogle,
    refreshUser,
  } = useAuth();
  const router = useRouter();

  const [providers, setProviders] = useState<{
    providers: Array<{
      id: string;
      user_id: string;
      provider: "password" | "google";
      provider_user_id: string | null;
    }>;
    has_password: boolean;
  } | null>(null);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSettingPassword, setIsSettingPassword] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profilePicture, setProfilePicture] = useState<string | null>(
    user?.profile_picture || null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedFileRef = useRef<File | null>(null);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [cpCurrent, setCpCurrent] = useState("");
  const [cpNew, setCpNew] = useState("");
  const [cpConfirm, setCpConfirm] = useState("");
  const [showCpCurrent, setShowCpCurrent] = useState(false);
  const [showCpNew, setShowCpNew] = useState(false);
  const [showCpConfirm, setShowCpConfirm] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [cpErrors, setCpErrors] = useState<string[]>([]);

  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    mode: "onBlur",
    defaultValues: {
      fullName: user?.full_name || user?.email || "",
      phone: user?.phone || "",
    },
  });

  const watchedFullName = watch(
    "fullName",
    user?.full_name || user?.email || ""
  );

  const { data: ordersData } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => unwrap(listMyOrders()),
    enabled: !!user,
  });
  const orders: OrderRead[] = ordersData ?? [];

  const { data: enrollmentsData } = useQuery({
    queryKey: ["my-enrollments"],
    queryFn: () => unwrap(listMyEnrollments()),
    enabled: !!user,
  });
  const enrollments = enrollmentsData ?? [];

  const enrolledCourseIds = new Set(enrollments.map((e) => e.course_id));

  const { data: allCoursesData } = useQuery({
    queryKey: ["all-courses"],
    queryFn: () => unwrap(coursesListCourses({ query: { page_size: 100 } })),
    enabled: !!user,
  });
  const allCourses: CourseListRead[] = allCoursesData ?? [];

  const enrolledCourses = allCourses.filter((c) => enrolledCourseIds.has(c.id));

  useEffect(() => {
    if (user) {
      reset({
        fullName: user.full_name || user.email || "",
        phone: user.phone || "",
      });
      setProfilePicture(user.profile_picture || null);
    }
  }, [user, reset]);

  const onProfileSubmit = async (data: ProfileFormValues) => {
    setIsSavingProfile(true);
    try {
      const body: BodyUsersUpdateOwnProfile = {};
      if (data.fullName !== user?.full_name) body.full_name = data.fullName;
      if (data.phone !== (user?.phone || "")) body.phone = data.phone ?? "";
      if (selectedFileRef.current)
        body.profile_picture_file = selectedFileRef.current;

      if (Object.keys(body).length > 0) {
        await unwrapVoid(updateOwnProfile({ body }));
      }

      selectedFileRef.current = null;
      await refreshUser();

      toast.success("Profile updated successfully");
      setIsEditing(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    selectedFileRef.current = file;

    const reader = new FileReader();
    reader.onload = (event) => {
      setProfilePicture(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const loadProviders = useCallback(async () => {
    try {
      const result = await getAuthProviders();
      setProviders(result as typeof providers);
    } catch {
      // Silently fail
    }
  }, [getAuthProviders]);

  useEffect(() => {
    if (activeTab === "settings") {
      void loadProviders();
    }
  }, [activeTab, loadProviders]);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  const handleSetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setIsSettingPassword(true);
    try {
      await setPassword(newPassword);
      toast.success("Password set successfully");
      setShowSetPassword(false);
      setNewPassword("");
      await loadProviders();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSettingPassword(false);
    }
  };

  const handleChangePassword = async () => {
    const errorsList: string[] = [];
    if (!cpCurrent) errorsList.push("Current password is required");
    if (!cpNew || cpNew.length < 8)
      errorsList.push("New password must be at least 8 characters");
    if (cpNew !== cpConfirm) errorsList.push("Passwords do not match");
    if (errorsList.length) {
      setCpErrors(errorsList);
      return;
    }
    setCpErrors([]);
    setIsChangingPassword(true);
    try {
      await changePassword(cpCurrent, cpNew);
      toast.success("Password changed successfully");
      setShowChangePassword(false);
      setCpCurrent("");
      setCpNew("");
      setCpConfirm("");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLinkGoogle = async (credential: string) => {
    setIsLinking(true);
    try {
      const result = await linkGoogle(credential);
      setProviders(result as typeof providers);
      toast.success("Google account linked successfully");
      setShowGoogleModal(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    setIsUnlinking(true);
    try {
      const result = await unlinkGoogle();
      setProviders(result as typeof providers);
      toast.success("Google account disconnected");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsUnlinking(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await logout();
      router.push("/");
    } catch (error) {
      toast.error(getErrorMessage(error));
      router.push("/");
    } finally {
      setIsSigningOut(false);
      setShowSignOutModal(false);
    }
  };

  if (!user) return null;

  const sidebarItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "courses", label: "My Courses", icon: BookOpen },
    { id: "orders", label: "Orders", icon: Package },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const statusStyles: Record<string, string> = {
    confirmed: "bg-green/10 text-green border border-green/30",
    shipped: "bg-blue/10 text-blue border border-blue/30",
    delivered: "bg-green/10 text-green border border-green/30",
    cancelled: "bg-red/10 text-red border border-red/30",
    pending: "bg-gold/10 text-gold border border-gold/30",
  };

  const joinedDate = user.created_at
    ? format(new Date(user.created_at), "MMM yyyy")
    : null;

  const initials = (user?.full_name ?? "User")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <AuthGuard allowedRoles={["user", "admin"]}>
      <main className="pt-20 min-h-screen">
        <div className="max-w-360 mx-auto px-4 sm:px-6 lg:px-16 py-8 md:py-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
            {/* Sidebar */}
            <div className="lg:col-span-3 lg:sticky lg:top-24 lg:self-start">
              <div className="border border-border bg-surface rounded overflow-hidden">
                <div className="p-6 border-b border-border">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-gold-bg border border-gold/20 flex items-center justify-center mb-4">
                    {profilePicture ? (
                      <img
                        src={profilePicture}
                        alt={user?.full_name || ""}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-gold font-bold text-xl">
                        {initials}
                      </span>
                    )}
                  </div>
                  <div className="text-text-main font-bold text-lg">
                    {user?.full_name}
                  </div>
                  <div className="text-text-muted text-sm font-mono mt-0.5">
                    {user.email}
                  </div>
                </div>
                <div>
                  {sidebarItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={cn(
                        "w-full flex items-center gap-4 px-6 py-4 text-sm text-left border-b border-border last:border-b-0 transition-all duration-200",
                        activeTab === item.id
                          ? "bg-gold-bg text-text-main border-l-2 border-l-gold"
                          : "text-text-muted hover:text-text-main hover:bg-muted/50 border-l-2 border-l-transparent"
                      )}
                    >
                      <item.icon
                        size={16}
                        className={activeTab === item.id ? "text-gold" : ""}
                      />
                      {item.label}
                    </button>
                  ))}
                  {user.role === "admin" && (
                    <Link
                      href="/admin"
                      className="w-full flex items-center gap-4 px-6 py-4 text-sm text-text-muted hover:text-red hover:bg-muted/50 transition-colors border-b border-border border-l-2 border-l-transparent"
                    >
                      <Shield size={16} /> Instructor Panel
                    </Link>
                  )}
                  <button
                    onClick={() => setShowSignOutModal(true)}
                    className="w-full flex items-center gap-4 px-6 py-4 text-sm text-left border-b border-border last:border-b-0 transition-all duration-200 text-text-muted hover:text-red hover:bg-red/5 border-l-2 border-l-transparent"
                  >
                    <LogOut size={16} /> Sign Out
                  </button>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-9 space-y-6 md:space-y-8">
              {/* ==================== OVERVIEW TAB ==================== */}
              {activeTab === "overview" && (
                <div className="space-y-6 md:space-y-8">
                  {/* Hero Section */}
                  <div className="border border-border bg-surface rounded overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-gold/5 rounded-bl-full pointer-events-none" />
                    <div className="p-6 md:p-8 lg:p-10 relative ">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div>
                          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-text-main">
                            {greeting},{" "}
                            {user.full_name?.split(" ")[0] || "there"}.
                          </h1>
                          <p className="text-text-muted text-sm mt-1.5 max-w-xl">
                            Track your progress, continue learning, and manage
                            your collection.
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-text-muted text-xs font-mono shrink-0">
                          <Calendar size={14} />
                          <span>Joined {joinedDate || "Recently"}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stats Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      {
                        label: "Enrolled Courses",
                        value: enrollments.length,
                        icon: BookOpen,
                      },
                      {
                        label: "Hours Watched",
                        value: 0,
                        suffix: "h",
                        icon: Clock,
                      },
                      { label: "Lessons Done", value: 0, icon: Check },
                      {
                        label: "Orders",
                        value: orders.length,
                        icon: ShoppingBag,
                      },
                    ].map((s) => (
                      <StatsCard
                        key={s.label}
                        label={s.label}
                        value={s.value}
                        suffix={s.suffix || ""}
                        icon={s.icon}
                      />
                    ))}
                  </div>

                  {/* Continue Watching */}
                  <ContinueWatching
                    items={[
                      ...(enrolledCourses.length > 0
                        ? [
                            {
                              course: enrolledCourses[0],
                              lessonTitle: "Getting Started",
                              lessonNumber: 1,
                              totalLessons:
                                enrolledCourses[0].lessons_count ?? 1,
                              progressPercent: 0,
                              lessonId: "",
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              )}

              {/* ==================== COURSES TAB ==================== */}
              {activeTab === "courses" && (
                <div className="space-y-6 md:space-y-8">
                  <h2 className="text-text-main font-bold text-2xl md:text-3xl">
                    My Courses
                  </h2>
                  {enrolledCourses.length === 0 ? (
                    <p className="text-text-muted text-sm">
                      Your enrolled courses will appear here.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                      {enrolledCourses.map((course) => (
                        <CourseCard key={course.id} course={course} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ==================== ORDERS TAB ==================== */}
              {activeTab === "orders" && (
                <div className="space-y-6 md:space-y-8">
                  <h2 className="text-text-main font-bold text-2xl md:text-3xl">
                    Purchase History
                  </h2>

                  {orders.length === 0 ? (
                    <p className="text-text-muted text-sm">No orders yet.</p>
                  ) : (
                    <>
                      {/* Mobile Cards */}
                      <div className="space-y-px bg-border md:hidden">
                        {orders.map((r) => {
                          const itemNames = (r.items ?? []).map(
                            (item) =>
                              item.course_id ??
                              item.product_id ??
                              `Item #${item.id}`
                          );
                          return (
                            <div
                              key={r.id}
                              className="bg-surface border border-border rounded p-5 space-y-3"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <div className="text-text-main font-semibold text-sm truncate">
                                    {itemNames[0] ??
                                      `Order #${r.id.slice(0, 8)}`}
                                  </div>
                                  <div className="text-text-muted text-xs font-mono mt-0.5">
                                    {r.items?.length ?? 0} item
                                    {(r.items?.length ?? 0) !== 1 ? "s" : ""}
                                  </div>
                                </div>
                                <span
                                  className={cn(
                                    "text-tiny font-mono tracking-widest uppercase px-2.5 py-1 shrink-0",
                                    statusStyles[r.status] ||
                                      "bg-text-muted/10 text-text-muted border border-text-muted/20"
                                  )}
                                >
                                  {r.status}
                                </span>
                              </div>
                              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                                <span className="text-label font-mono text-text-muted">
                                  {format(
                                    new Date(r.created_at),
                                    "dd MMM yyyy"
                                  )}
                                </span>
                                <span className="text-text-main font-semibold">
                                  {displayPrice(r.total_amount)}
                                </span>
                              </div>
                              <Link
                                href={`/orders/${r.id}`}
                                className="text-tiny font-mono tracking-widest uppercase text-gold hover:text-text-main transition-colors pt-1 inline-flex items-center gap-1"
                              >
                                View Order <ArrowUpRight size={12} />
                              </Link>
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop Table */}
                      <div className="hidden md:block border border-border rounded overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              {[
                                "Order",
                                "Items",
                                "Date",
                                "Amount",
                                "Status",
                                "",
                              ].map((h) => (
                                <th
                                  key={h}
                                  className="text-left px-6 py-4 text-label font-mono text-text-muted tracking-widest uppercase bg-dark-soft"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {orders.map((r) => {
                              const itemNames = (r.items ?? []).map(
                                (item) =>
                                  item.course_id ??
                                  item.product_id ??
                                  `Item #${item.id}`
                              );
                              return (
                                <tr
                                  key={r.id}
                                  className="hover:bg-muted/30 transition-colors"
                                >
                                  <td className="px-6 py-4 text-text-main font-mono text-xs">
                                    #{r.id.slice(0, 8)}
                                  </td>
                                  <td className="px-6 py-4 text-text-main font-medium">
                                    {itemNames[0] ?? "—"}
                                    {itemNames.length > 1 && (
                                      <span className="text-text-muted text-xs ml-1">
                                        +{itemNames.length - 1} more
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-text-muted font-mono text-xs">
                                    {format(
                                      new Date(r.created_at),
                                      "dd MMM yyyy"
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-text-main font-semibold">
                                    {displayPrice(r.total_amount)}
                                  </td>
                                  <td className="px-6 py-4">
                                    <span
                                      className={cn(
                                        "text-tiny font-mono tracking-widest uppercase px-2.5 py-1",
                                        statusStyles[r.status] ||
                                          "bg-text-muted/10 text-text-muted border border-text-muted/20"
                                      )}
                                    >
                                      {r.status}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4">
                                    <Link
                                      href={`/orders/${r.id}`}
                                      className="text-tiny font-mono tracking-widest uppercase text-gold hover:text-text-main transition-colors inline-flex items-center gap-1"
                                    >
                                      View <ArrowUpRight size={12} />
                                    </Link>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ==================== SETTINGS TAB ==================== */}
              {activeTab === "settings" && (
                <div className="space-y-8 md:space-y-10">
                  {/* Profile Section */}
                  <div>
                    <h2 className="text-text-main font-bold text-2xl md:text-3xl mb-6">
                      Profile Settings
                    </h2>
                    <form onSubmit={handleSubmit(onProfileSubmit)}>
                      <div className="border border-border bg-surface rounded divide-y divide-border overflow-hidden">
                        {/* Avatar */}
                        <div className="px-6 md:px-8 py-6 md:py-8 flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
                          <label className="text-label font-mono text-text-muted tracking-widest uppercase md:w-32 shrink-0">
                            Avatar
                          </label>
                          <div className="flex items-center gap-5">
                            <div className="w-20 h-20 rounded-full overflow-hidden bg-gold-bg border border-gold/20 flex items-center justify-center shrink-0">
                              {profilePicture ? (
                                <img
                                  src={profilePicture}
                                  alt={watchedFullName || "Avatar"}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-gold font-bold text-2xl">
                                  {initials}
                                </span>
                              )}
                            </div>
                            {isEditing && (
                              <div>
                                <button
                                  type="button"
                                  onClick={handleImageUpload}
                                  className="inline-flex items-center gap-2 px-4 py-2 border border-border text-text-muted text-xs font-mono tracking-widest uppercase hover:border-gold hover:text-gold hover:bg-gold-bg transition-colors rounded"
                                >
                                  <Camera size={14} /> Upload Photo
                                </button>
                                <input
                                  ref={fileInputRef}
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={handleFileChange}
                                />
                                <p className="text-tiny font-mono text-text-muted mt-1.5">
                                  JPG, PNG or WebP. Max 100MB.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Full Name */}
                        <div className="px-6 md:px-8 py-5 md:py-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                          <label className="text-label font-mono text-text-muted tracking-widest uppercase md:w-32 shrink-0">
                            Full Name
                          </label>
                          <div className="flex-1">
                            {isEditing ? (
                              <input
                                {...register("fullName")}
                                type="text"
                                className={cn(
                                  "w-full glass-input rounded text-text-main px-4 py-3 text-sm focus:border-gold transition-colors",
                                  errors.fullName
                                    ? "border-red"
                                    : "border-border"
                                )}
                              />
                            ) : (
                              <div className="text-text-main text-sm py-3">
                                {user?.full_name}
                              </div>
                            )}
                            {errors.fullName && (
                              <p className="mt-1 text-xs text-red font-mono">
                                {errors.fullName.message}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Email (read-only) */}
                        <div className="px-6 md:px-8 py-5 md:py-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                          <label className="text-label font-mono text-text-muted tracking-widest uppercase md:w-32 shrink-0">
                            Email
                          </label>
                          <div className="flex-1">
                            <div className="text-text-main text-sm py-3">
                              {user?.email}
                            </div>
                          </div>
                        </div>

                        {/* Phone */}
                        <div className="px-6 md:px-8 py-5 md:py-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                          <label className="text-label font-mono text-text-muted tracking-widest uppercase md:w-32 shrink-0">
                            Phone
                          </label>
                          <div className="flex-1">
                            {isEditing ? (
                              <input
                                {...register("phone")}
                                type="text"
                                className={cn(
                                  "w-full glass-input rounded text-text-main px-4 py-3 text-sm focus:border-gold transition-colors",
                                  errors.phone ? "border-red" : "border-border"
                                )}
                              />
                            ) : (
                              <div className="text-text-main text-sm py-3">
                                {user?.phone || ""}
                              </div>
                            )}
                            {errors.phone && (
                              <p className="mt-1 text-xs text-red font-mono">
                                {errors.phone.message}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-6 flex items-center justify-end gap-3">
                        {isEditing ? (
                          <>
                            <GhostBtn
                              type="button"
                              onClick={() => {
                                setIsEditing(false);
                                selectedFileRef.current = null;
                                setProfilePicture(
                                  user?.profile_picture || null
                                );
                                reset({
                                  fullName:
                                    user?.full_name || user?.email || "",
                                  phone: user?.phone || "",
                                });
                              }}
                              disabled={isSavingProfile}
                              className="shrink-0 px-6! text-xs! py-3!"
                            >
                              Cancel
                            </GhostBtn>
                            <PrimaryBtn
                              type="submit"
                              disabled={isSavingProfile}
                              className="shrink-0 px-6! text-xs! py-3!"
                            >
                              {isSavingProfile ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <>
                                  Save Changes <Check size={16} />
                                </>
                              )}
                            </PrimaryBtn>
                          </>
                        ) : (
                          <PrimaryBtn
                            type="button"
                            onClick={() => setIsEditing(true)}
                            className="shrink-0 px-6! text-xs! py-3!"
                          >
                            <User size={16} /> Edit Profile
                          </PrimaryBtn>
                        )}
                      </div>
                    </form>
                  </div>

                  {/* Saved Addresses */}
                  <AddressManager />

                  {/* Connected Sign-In Methods */}
                  <div>
                    <h2 className="text-text-main font-bold text-2xl md:text-3xl mb-6">
                      Connected Sign-In Methods
                    </h2>
                    {!providers ? (
                      <div className="border border-border bg-surface rounded overflow-hidden divide-y divide-border">
                        {Array.from({ length: 2 }).map((_, i) => (
                          <div
                            key={i}
                            className="px-6 md:px-8 py-5 md:py-6 flex items-center gap-4"
                          >
                            <Skeleton className="w-10 h-10 rounded-sm shrink-0" />
                            <div className="flex-1 space-y-2">
                              <Skeleton className="h-4 w-24" />
                              <Skeleton className="h-3 w-40" />
                            </div>
                            <Skeleton className="h-4 w-20 shrink-0" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        <div className="border border-border bg-surface rounded overflow-hidden divide-y divide-border">
                          <ProviderCard
                            name="Google"
                            description="Sign in with your Google account"
                            icon={<Globe size={18} className="text-gold" />}
                            isConnected={providers.providers.some(
                              (p) => p.provider === "google"
                            )}
                            action={
                              providers.providers.some(
                                (p) => p.provider === "google"
                              ) ? (
                                <button
                                  onClick={handleUnlinkGoogle}
                                  disabled={isUnlinking}
                                  className="text-red text-xs font-mono tracking-widest uppercase hover:text-red/70 transition-colors disabled:opacity-50"
                                >
                                  {isUnlinking
                                    ? "Disconnecting..."
                                    : "Disconnect"}
                                </button>
                              ) : (
                                <button
                                  onClick={() => setShowGoogleModal(true)}
                                  disabled={isLinking}
                                  className="text-gold text-xs font-mono tracking-widest uppercase hover:text-text-main transition-colors disabled:opacity-50"
                                >
                                  {isLinking ? "Connecting..." : "Connect"}
                                </button>
                              )
                            }
                          />
                          <ProviderCard
                            name="Password"
                            description="Sign in with your email and password"
                            icon={<KeyRound size={18} className="text-gold" />}
                            isConnected={providers.has_password}
                            action={
                              !providers.has_password ? (
                                <button
                                  onClick={() => setShowSetPassword(true)}
                                  className="text-gold text-xs font-mono tracking-widest uppercase hover:text-text-main transition-colors"
                                >
                                  Set Password
                                </button>
                              ) : undefined
                            }
                          />
                        </div>

                        {/* Set Password Form */}
                        {showSetPassword && (
                          <div className="mt-3 border border-border bg-surface rounded p-5">
                            <h2 className="text-text-main font-semibold text-lg mb-1">
                              Set a Password
                            </h2>
                            <p className="text-text-muted text-tiny font-mono mb-3">
                              Add password-based login to your account so you
                              can sign in without Google.
                            </p>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                              <div className="relative flex-1">
                                <input
                                  type={showNewPassword ? "text" : "password"}
                                  value={newPassword}
                                  onChange={(e) =>
                                    setNewPassword(e.target.value)
                                  }
                                  placeholder="Enter new password"
                                  className="w-full glass-input rounded text-text-main px-3 py-2.5 pr-10 text-sm focus:border-gold transition-colors"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowNewPassword((v) => !v)}
                                  className="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted hover:text-text-main transition-colors"
                                  aria-label={
                                    showNewPassword
                                      ? "Hide password"
                                      : "Show password"
                                  }
                                >
                                  {showNewPassword ? (
                                    <EyeOff size={14} />
                                  ) : (
                                    <Eye size={14} />
                                  )}
                                </button>
                              </div>
                              <PrimaryBtn
                                onClick={handleSetPassword}
                                disabled={isSettingPassword}
                                className="shrink-0 px-6! text-xs! py-3!"
                              >
                                {isSettingPassword ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  "Set Password"
                                )}
                              </PrimaryBtn>
                              <button
                                onClick={() => {
                                  setShowSetPassword(false);
                                  setNewPassword("");
                                }}
                                className="text-text-muted text-xs font-mono tracking-widest uppercase hover:text-text-main transition-colors shrink-0"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Change Password */}
                        {providers.has_password && (
                          <div className="mt-3 border border-border bg-surface rounded overflow-hidden">
                            <div className="px-5 md:px-6 py-4 border-b border-border">
                              <h2 className="text-text-main font-semibold text-lg">
                                Change Password
                              </h2>
                              <p className="text-text-muted text-tiny font-mono mt-0.5">
                                Use 8+ characters with one uppercase letter and
                                one special character.
                              </p>
                            </div>
                            {showChangePassword ? (
                              <div className="p-5 space-y-4">
                                <div>
                                  <label className="block text-label font-mono text-text-muted tracking-widest uppercase mb-1">
                                    Current Password
                                  </label>
                                  <div className="relative">
                                    <input
                                      type={showCpCurrent ? "text" : "password"}
                                      value={cpCurrent}
                                      onChange={(e) =>
                                        setCpCurrent(e.target.value)
                                      }
                                      className="w-full glass-input rounded text-text-main px-3 py-2.5 pr-10 text-sm focus:border-gold transition-colors"
                                      placeholder="Enter current password"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setShowCpCurrent((v) => !v)
                                      }
                                      className="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted hover:text-text-main transition-colors"
                                      aria-label={
                                        showCpCurrent
                                          ? "Hide password"
                                          : "Show password"
                                      }
                                    >
                                      {showCpCurrent ? (
                                        <EyeOff size={14} />
                                      ) : (
                                        <Eye size={14} />
                                      )}
                                    </button>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-label font-mono text-text-muted tracking-widest uppercase mb-1">
                                    New Password
                                  </label>
                                  <div className="relative">
                                    <input
                                      type={showCpNew ? "text" : "password"}
                                      value={cpNew}
                                      onChange={(e) => setCpNew(e.target.value)}
                                      className="w-full glass-input rounded text-text-main px-3 py-2.5 pr-10 text-sm focus:border-gold transition-colors"
                                      placeholder="Enter new password"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setShowCpNew((v) => !v)}
                                      className="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted hover:text-text-main transition-colors"
                                      aria-label={
                                        showCpNew
                                          ? "Hide password"
                                          : "Show password"
                                      }
                                    >
                                      {showCpNew ? (
                                        <EyeOff size={14} />
                                      ) : (
                                        <Eye size={14} />
                                      )}
                                    </button>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-label font-mono text-text-muted tracking-widest uppercase mb-1">
                                    Confirm New Password
                                  </label>
                                  <div className="relative">
                                    <input
                                      type={showCpConfirm ? "text" : "password"}
                                      value={cpConfirm}
                                      onChange={(e) =>
                                        setCpConfirm(e.target.value)
                                      }
                                      className="w-full glass-input rounded text-text-main px-3 py-2.5 pr-10 text-sm focus:border-gold transition-colors"
                                      placeholder="Confirm new password"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setShowCpConfirm((v) => !v)
                                      }
                                      className="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted hover:text-text-main transition-colors"
                                      aria-label={
                                        showCpConfirm
                                          ? "Hide password"
                                          : "Show password"
                                      }
                                    >
                                      {showCpConfirm ? (
                                        <EyeOff size={14} />
                                      ) : (
                                        <Eye size={14} />
                                      )}
                                    </button>
                                  </div>
                                </div>
                                {cpErrors.length > 0 && (
                                  <div className="p-2.5 bg-red/5 border border-red/20 rounded">
                                    <ul className="space-y-0.5">
                                      {cpErrors.map((err, i) => (
                                        <li
                                          key={i}
                                          className="text-tiny text-red font-mono flex items-start gap-1.5"
                                        >
                                          <span className="mt-0.5 shrink-0">
                                            •
                                          </span>
                                          {err}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                <div className="flex items-center justify-end gap-3 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowChangePassword(false);
                                      setCpCurrent("");
                                      setCpNew("");
                                      setCpConfirm("");
                                      setCpErrors([]);
                                    }}
                                    disabled={isChangingPassword}
                                    className="text-text-muted text-xs font-mono tracking-widest uppercase hover:text-text-main transition-colors disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                  <PrimaryBtn
                                    onClick={handleChangePassword}
                                    disabled={isChangingPassword}
                                    className="px-6! text-xs! py-3!"
                                  >
                                    {isChangingPassword ? (
                                      <Loader2
                                        size={14}
                                        className="animate-spin"
                                      />
                                    ) : (
                                      "Save Password"
                                    )}
                                  </PrimaryBtn>
                                </div>
                              </div>
                            ) : (
                              <div className="p-5">
                                <div className="flex items-center justify-between gap-4">
                                  <p className="text-text-muted text-xs font-mono">
                                    Use a strong, unique password.
                                  </p>
                                  <PrimaryBtn
                                    type="button"
                                    onClick={() => setShowChangePassword(true)}
                                    className="shrink-0 px-6! text-xs! py-3!"
                                  >
                                    <KeyRound size={14} /> Change Password
                                  </PrimaryBtn>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Active Sessions */}
                  <SessionManager />

                  {/* Danger Zone */}
                  <DangerZone />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Google Connect Modal */}
        {showGoogleModal && (
          <div
            className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowGoogleModal(false);
              }
            }}
          >
            <div className="w-full max-w-sm bg-surface border border-border/60 shadow-2xl rounded overflow-hidden">
              <div className="relative px-8 pt-10 pb-6 text-center">
                <button
                  onClick={() => setShowGoogleModal(false)}
                  className="absolute top-4 right-4 text-text-muted hover:text-text-main transition-colors"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
                <div className="w-14 h-14 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center mx-auto mb-5">
                  <Globe size={28} className="text-gold" />
                </div>
                <h3 className="text-text-main font-bold text-lg mb-2">
                  Link Your Google Account
                </h3>
                <p className="text-text-muted text-sm leading-relaxed">
                  Connect your Google account for one-click sign-in. Your
                  profile picture and name will sync automatically.
                </p>
              </div>
              <div className="px-8 pb-8 flex justify-center">
                <GoogleLoginButton onSuccess={handleLinkGoogle} />
              </div>
            </div>
          </div>
        )}

        {/* Sign Out Confirmation Modal */}
        {showSignOutModal && (
          <div
            className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm rounded"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowSignOutModal(false);
              }
            }}
          >
            <div className="w-full max-w-sm bg-surface border border-border shadow-lg rounded">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <LogOut size={18} className="text-red" />
                  <h3 className="text-text-main font-bold text-base">
                    Sign Out
                  </h3>
                </div>
                <button
                  onClick={() => setShowSignOutModal(false)}
                  className="text-text-muted hover:text-text-main transition-colors"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-6">
                <p className="text-text-muted text-sm">
                  Are you sure you want to sign out? You will need to sign in
                  again to access your dashboard.
                </p>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowSignOutModal(false)}
                  disabled={isSigningOut}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-border text-text-muted text-xs font-mono tracking-widest uppercase hover:text-text-main hover:border-gold/50 transition-colors rounded disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-red/10 border border-red/30 text-red text-xs font-mono tracking-widest uppercase hover:bg-red/20 transition-colors rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSigningOut ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <LogOut size={14} />
                  )}
                  {isSigningOut ? "Signing out..." : "Sign Out"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <TabInitializer />
    </Suspense>
  );
}
