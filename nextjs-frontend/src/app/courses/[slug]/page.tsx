"use client";

import { unwrap } from "@/api/client-service";
import type {
  CourseCurriculumRead,
  CourseProgressRead,
  CoursePurchaseResponse,
  CourseRead,
  CourseSectionWithLessonsRead,
} from "@/api/openapi-client";
import {
  coursesGetCourse,
  getCourseCurriculum,
  getCourseProgress,
  getEnrollmentStatus,
  initiateCoursePurchase,
  verifyCoursePayment,
} from "@/api/openapi-client";
import { GhostBtn, PrimaryBtn } from "@/components/ui/buttons";
import { CourseReviewsSection } from "@/components/ui/CourseReviewsSection";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import { RevealBlock } from "@/components/ui/misc";
import { ModalType, StatusModal } from "@/components/ui/StatusModal";
import { CouponInput } from "@/components/ui/CouponInput";
import { useAuth } from "@/lib/auth-store";
import { getSafeReturnTo } from "@/lib/auth-utils";
import { useNavStore } from "@/lib/nav-store";
import {
  enterVideoFullscreen,
  exitVideoFullscreen,
  isInFullscreen,
} from "@/lib/video-fullscreen";
import { useWishlistStore } from "@/lib/wishlist-store";
import { cn, displayPrice } from "@/lib/utils";
import { CourseDetailSkeleton } from "@/components/lms/CourseDetailSkeleton";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Check,
  Heart,
  Maximize,
  Minimize,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Star,
  Users,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { notFound, usePathname, useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PointerEvent as ReactPointerEvent } from "react";

function formatDuration(seconds: number | undefined | null): string {
  if (!seconds) return "Self-paced";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

async function fetchCourseBySlug(slug: string): Promise<CourseRead> {
  return unwrap(coursesGetCourse({ path: { slug } }));
}

function DemoVideoPlayer({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => setTime(video.currentTime);
    const onDur = () => setDuration(video.duration);
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    const onVol = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const onEnded = () => setPaused(true);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDur);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVol);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDur);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVol);
      video.removeEventListener("ended", onEnded);
    };
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(isInFullscreen());
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }, []);

  const handleFullscreen = useCallback(() => {
    if (!isInFullscreen()) {
      enterVideoFullscreen(videoRef.current, containerRef.current);
    } else {
      exitVideoFullscreen();
    }
  }, []);

  const seekFromClientX = useCallback((clientX: number) => {
    const el = timelineRef.current;
    const video = videoRef.current;
    if (!el || !video || !video.duration) return;
    const rect = el.getBoundingClientRect();
    const pos = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    video.currentTime = pos * video.duration;
    setTime(video.currentTime);
  }, []);

  const handleTimelinePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setIsScrubbing(true);
      seekFromClientX(e.clientX);
    },
    [seekFromClientX]
  );

  const handleTimelinePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (isScrubbing) seekFromClientX(e.clientX);
    },
    [isScrubbing, seekFromClientX]
  );

  const handleTimelinePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isScrubbing) return;
      seekFromClientX(e.clientX);
      setIsScrubbing(false);
    },
    [isScrubbing, seekFromClientX]
  );

  const fmtTime = (s: number | undefined | null) => {
    if (!s || s <= 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
        className="fixed inset-0 z-100 flex flex-col bg-black"
        onClick={onClose}
      >
        <div
          ref={containerRef}
          className={cn(
            "flex-1 flex flex-col bg-dark min-w-0 min-h-0 select-none",
            fullscreen && "relative"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative flex-1 flex items-center justify-center bg-dark min-h-0 overflow-hidden select-none">
            <video
              ref={videoRef}
              src={url}
              className="w-full h-full object-contain"
              playsInline
              preload="metadata"
              draggable={false}
            />
            {paused && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay();
                  }}
                  className="w-20 h-20 bg-text-main/10 backdrop-blur border border-white/10 flex items-center justify-center hover:bg-gold/20 hover:border-gold/30 transition-all"
                >
                  <Play
                    size={28}
                    className="text-text-main fill-text-main ml-1.5"
                  />
                </button>
              </div>
            )}
          </div>
          <div
            className={cn(
              "px-4 sm:px-8 py-4 transition-opacity duration-300 select-none",
              fullscreen
                ? "absolute bottom-0 left-0 right-0 z-10 bg-muted-light"
                : "bg-muted-light border-t border-border",
              fullscreen && !paused && "opacity-0 pointer-events-none"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-label font-mono text-text-muted shrink-0 w-14 text-right text-xs">
                {fmtTime(time)}
              </span>
              <div
                ref={timelineRef}
                className="flex-1 h-8 flex items-center cursor-pointer touch-none group"
                onPointerDown={handleTimelinePointerDown}
                onPointerMove={handleTimelinePointerMove}
                onPointerUp={handleTimelinePointerUp}
                onPointerCancel={handleTimelinePointerUp}
              >
                <div className="relative w-full h-1.5 bg-border rounded-full">
                  <div
                    className="absolute inset-y-0 left-0 bg-gold rounded-full"
                    style={{
                      width: `${
                        duration > 0 ? Math.min((time / duration) * 100, 100) : 0
                      }%`,
                    }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-gold border-2 border-dark rounded-full shadow-[0_0_8px_rgba(212,175,55,0.7)] pointer-events-none transition-transform group-hover:scale-110"
                    style={{
                      left: `${
                        duration > 0 ? Math.min((time / duration) * 100, 100) : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-label font-mono text-text-muted shrink-0 w-14 text-xs">
                {fmtTime(duration)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={togglePlay}
                  className="text-text-muted hover:text-text-main transition-colors shrink-0"
                >
                  {paused ? (
                    <Play size={18} className="fill-current" />
                  ) : (
                    <Pause size={18} />
                  )}
                </button>
                <button
                  onClick={() => {
                    const video = videoRef.current;
                    if (!video) return;
                    video.currentTime = Math.max(video.currentTime - 10, 0);
                  }}
                  className="text-text-muted hover:text-text-main transition-colors shrink-0"
                  title="Rewind 10s"
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  onClick={() => {
                    const video = videoRef.current;
                    if (!video || !video.duration) return;
                    video.currentTime = Math.min(
                      video.currentTime + 10,
                      video.duration
                    );
                  }}
                  className="text-text-muted hover:text-text-main transition-colors shrink-0"
                  title="Forward 10s"
                >
                  <RotateCw size={16} />
                </button>
                <div className="hidden sm:flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      const video = videoRef.current;
                      if (!video) return;
                      video.muted = !video.muted;
                    }}
                    className="text-text-muted hover:text-text-main transition-colors"
                  >
                    {muted || volume === 0 ? (
                      <VolumeX size={16} />
                    ) : volume < 0.5 ? (
                      <Volume1 size={16} />
                    ) : (
                      <Volume2 size={16} />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => {
                      const video = videoRef.current;
                      if (!video) return;
                      const v = parseFloat(e.target.value);
                      video.volume = v;
                      if (v === 0) video.muted = true;
                      else video.muted = false;
                    }}
                    className="w-20 h-1 accent-gold cursor-pointer"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 text-text-muted shrink-0">
                <button
                  onClick={onClose}
                  className="text-text-muted hover:text-text-main transition-colors"
                  title="Close"
                >
                  <X size={18} />
                </button>
                <button
                  onClick={handleFullscreen}
                  className="text-text-muted hover:text-text-main transition-colors"
                  title="Fullscreen"
                >
                  {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [openSection, setOpenSection] = useState<number | null>(0);
  const [showDemo, setShowDemo] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [couponResult, setCouponResult] = useState<{
    code: string;
    discount_amount: number;
    final_total: number;
    gateway_fee: number;
    discount_type: string;
    discount_value: number;
  } | null>(null);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: ModalType;
    title: string;
    message: string;
    actionText?: string;
    onAction?: () => void;
  }>({
    isOpen: false,
    type: "success",
    title: "",
    message: "",
  });
  const { user } = useAuth();
  const endCourseNavigation = useNavStore((s) => s.endCourseNavigation);

  const router = useRouter();
  const pathname = usePathname();
  const returnTo = getSafeReturnTo(pathname) ?? "/";
  const loginHref = `/login?returnTo=${encodeURIComponent(returnTo)}`;

  const {
    data: course,
    isLoading: courseLoading,
    error: courseError,
  } = useQuery<CourseRead>({
    queryKey: ["course", slug],
    queryFn: () => fetchCourseBySlug(slug),
  });

  const courseId = course?.id;

  const { data: curriculumData } = useQuery<CourseCurriculumRead | null>({
    queryKey: ["course-curriculum", courseId],
    queryFn: async () => {
      try {
        return await unwrap(
          getCourseCurriculum({ path: { course_id: courseId! } })
        );
      } catch {
        return null;
      }
    },
    enabled: !!courseId,
  });

  const { data: enrollment } = useQuery({
    queryKey: ["course-enrollment", courseId],
    queryFn: () =>
      unwrap(getEnrollmentStatus({ path: { course_id: courseId! } })),
    enabled: !!courseId && !!user,
  });

  const isEnrolled = !!enrollment || user?.role === "admin";

  const { data: courseProgress } = useQuery<CourseProgressRead>({
    queryKey: ["course-progress", courseId],
    queryFn: () =>
      unwrap<CourseProgressRead>(
        getCourseProgress({ path: { course_id: courseId! } })
      ),
    enabled: !!courseId && isEnrolled,
  });

  const isCourseCompleted = (courseProgress?.progress_percentage ?? 0) >= 100;

  const {
    isCourseWishlisted,
    toggleCourse: toggleCourseWishlist,
  } = useWishlistStore();

  const handleToggleWishlist = async () => {
    if (!user) {
      router.push(loginHref);
      return;
    }
    if (!courseId) return;
    await toggleCourseWishlist(courseId);
  };

  const sections: CourseSectionWithLessonsRead[] =
    curriculumData?.sections ?? [];

  const totalLessons = course?.lessons_count
    ? course.lessons_count
    : sections.reduce((acc, s) => acc + (s.lessons?.length ?? 0), 0);

  const hasPreviewLesson = sections.some((s) =>
    s.lessons?.some((l) => l.is_preview && l.computed_video_url)
  );

  const goToLesson = () => {
    if (!user) {
      router.push(loginHref);
      return;
    }
    const firstLesson = sections
      .flatMap((s) => s.lessons ?? [])
      .find((l) => l.computed_video_url);
    if (firstLesson) {
      router.push(`/courses/${slug}/lessons/${firstLesson.id}`);
    } else {
      router.push(`/courses/${slug}`);
    }
  };

  const goToPreviewLesson = () => {
    if (!user) {
      router.push(loginHref);
      return;
    }
    for (const section of sections) {
      const previewLesson = (section.lessons ?? []).find(
        (l) => l.is_preview && l.computed_video_url
      );
      if (previewLesson) {
        router.push(`/courses/${slug}/lessons/${previewLesson.id}`);
        return;
      }
    }
  };

  const handleBuyCourse = async () => {
    if (!user) {
      router.push(loginHref);
      return;
    }
    setIsPurchasing(true);
    try {
      const result = await unwrap(initiateCoursePurchase({ path: { slug }, body: { coupon_code: couponResult?.code } }));
      handleRazorpayPayment(result);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to initiate purchase";
      setModalConfig({
        isOpen: true,
        type: "error",
        title: "Purchase Failed",
        message,
        actionText: "TRY AGAIN",
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRazorpayPayment = (purchase: CoursePurchaseResponse) => {
    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: purchase.amount,
      currency: "INR",
      name: "ArtistKashi",
      description: purchase.course_title,
      order_id: purchase.razorpay_order_id,
      handler: async function (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) {
        try {
          await unwrap(
            verifyCoursePayment({
              path: { slug },
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
            })
          );

          setModalConfig({
            isOpen: true,
            type: "success",
            title: "Enrolled Successfully",
            message: "You are now enrolled in this course. Start learning now!",
            actionText: "START LEARNING",
            onAction: () => {
              setModalConfig((prev) => ({ ...prev, isOpen: false }));
              router.push(`/courses/${slug}/lessons`);
            },
          });

          window.location.reload();
        } catch (err: unknown) {
          setModalConfig({
            isOpen: true,
            type: "error",
            title: "Verification Failed",
            message:
              err instanceof Error
                ? err.message
                : "Payment verification failed. If money was deducted, please contact support.",
            actionText: "CONTACT SUPPORT",
            onAction: () => {
              setModalConfig((prev) => ({ ...prev, isOpen: false }));
              router.push("/contact");
            },
          });
        }
      },
      prefill: {
        name: user?.full_name,
        email: user?.email,
      },
      theme: {
        color: "#D4AF37",
      },
      modal: {
        ondismiss: () => {
          setIsPurchasing(false);
        },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  };

  useEffect(() => {
    document.title = "Artist Kashi";
  }, []);

  useEffect(() => {
    endCourseNavigation();
  }, [endCourseNavigation]);

  useEffect(() => {
    if (course) document.title = course.title;
  }, [course]);

  useEffect(() => {
    if (courseError) document.title = "Not Found — Artist Kashi";
  }, [courseError]);

  if (courseLoading) {
    return <CourseDetailSkeleton />;
  }

  if (courseError || !course) {
    endCourseNavigation();
    notFound();
  }

  return (
    <main className="min-h-screen">
      {/* Hero with background image */}
      <div className="relative min-h-[85vh] flex items-center pt-24">
        {course.computed_thumbnail_url && (
          <>
            <ImageWithFallback
              src={course.computed_thumbnail_url}
              alt={course.title}
              className="absolute inset-0 w-full h-full object-cover"
              unoptimized
            />
            <div className="absolute inset-0 bg-linear-to-r from-dark via-dark/85 to-dark/70" />
          </>
        )}
        {!course.computed_thumbnail_url && (
          <div className="absolute inset-0 bg-dark" />
        )}

        <div className="relative z-10 w-full max-w-360 mx-auto px-8 lg:px-16 py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
            <div className="lg:col-span-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="text-label font-mono text-gold tracking-[0.2em] uppercase">
                  Masterclass
                </div>
                {course.category && (
                  <>
                    <span className="text-text-muted/40">/</span>
                    <span className="text-label font-mono text-text-muted tracking-[0.2em] uppercase ">
                      {course.category.name}
                    </span>
                  </>
                )}
              </div>
              <h1 className="text-h2 font-extrabold tracking-[-0.02em] text-white leading-tight max-w-2xl mb-4">
                {course.title}
              </h1>
              <p className="text-text-muted max-w-md mb-6">
                {course.short_description ?? ""}
              </p>
              <div className="flex items-center gap-6 text-sm font-mono text-text-muted mb-8">
                <span className="flex items-center gap-1.5">
                  <BookOpen size={12} />
                  {totalLessons} lessons ·{" "}
                  {formatDuration(course.total_duration_seconds)}
                </span>
                {(course.average_rating ?? 0) > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Star size={12} className="text-primary" />
                    {course.average_rating?.toFixed(1)} ({course.review_count})
                  </span>
                )}
              </div>

              {course.what_you_will_learn &&
                course.what_you_will_learn.length > 0 && (
                  <div className="mb-6">
                    <div className="text-2xs font-mono text-gold uppercase tracking-widest mb-3">
                      What You Will Learn
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {course.what_you_will_learn.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 text-sm text-text-muted"
                        >
                          <Check
                            size={12}
                            className="text-gold shrink-0 mt-0.5"
                          />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {course.requirements && course.requirements.length > 0 && (
                <div>
                  <div className="text-2xs font-mono text-gold uppercase tracking-widest mb-3">
                    Requirements
                  </div>
                  <ul className="space-y-1">
                    {course.requirements.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-text-muted"
                      >
                        <Check
                          size={12}
                          className="text-gold shrink-0 mt-0.5"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 self-start">
              <div className="border border-border bg-muted-light/95 backdrop-blur-md rounded">
                <div className="relative aspect-video overflow-hidden rounded-t">
                  <ImageWithFallback
                    src={course.computed_thumbnail_url}
                    alt={course.title}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                  {course.computed_demo_video_url && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <button
                        onClick={() => setShowDemo(true)}
                        className="w-16 h-16 bg-black/40 backdrop-blur-md border border-white/30 flex items-center justify-center hover:bg-gold/30 hover:border-gold/50 transition-all shadow-lg cursor-pointer rounded"
                      >
                        <Play
                          size={22}
                          fill="white"
                          className="text-white ml-1"
                        />
                      </button>
                    </div>
                  )}
                  {showDemo &&
                    course.computed_demo_video_url &&
                    typeof document !== "undefined" &&
                    createPortal(
                      <DemoVideoPlayer
                        url={course.computed_demo_video_url}
                        onClose={() => setShowDemo(false)}
                      />,
                      document.body
                    )}
                </div>
                <div className="p-8">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-text-main font-extrabold text-4xl">
                      {displayPrice(course.price)}
                    </div>
                    <button
                      onClick={handleToggleWishlist}
                      className="flex items-center justify-center w-10 h-10 border border-border/60 text-text-muted hover:text-danger hover:border-danger/40 transition-all rounded-sm"
                    >
                      <Heart
                        size={16}
                        className={
                          course.id && isCourseWishlisted(course.id)
                            ? "fill-danger text-danger"
                            : ""
                        }
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-4 mb-8">
                    {!!course.average_rating && (
                      <div className="flex items-center gap-1.5 text-text-muted">
                        <Star size={14} className="text-gold fill-gold" />
                        <span className="text-label font-mono tracking-widest">
                          {course.average_rating.toFixed(1)}
                        </span>
                        {!!course.review_count && (
                          <span className="text-label font-mono text-text-muted tracking-widest">
                            ({course.review_count})
                          </span>
                        )}
                      </div>
                    )}
                    {!!course.enrollment_count && (
                      <div className="flex items-center gap-1.5 text-text-muted">
                        <Users size={14} />
                        <span className="text-label font-mono tracking-widest">
                          {course.enrollment_count.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {isEnrolled ? (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xs font-mono text-gold uppercase tracking-widest">
                          {isCourseCompleted
                            ? "Course Completed"
                            : "Course Progress"}
                        </span>
                        <span className="text-2xs font-mono text-text-muted">
                          {courseProgress?.completed_lessons ?? 0}/
                          {courseProgress?.total_lessons ?? totalLessons}{" "}
                          lessons
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-border rounded-full overflow-hidden mb-4">
                        <div
                          className="h-full bg-gold rounded-full transition-all duration-700"
                          style={{
                            width: `${courseProgress?.progress_percentage ?? 0}%`,
                          }}
                        />
                      </div>
                      <PrimaryBtn
                        type="button"
                        onClick={goToLesson}
                        className="w-full justify-center"
                      >
                        {isCourseCompleted ? (
                          <>
                            Watch Again <RotateCcw size={16} />
                          </>
                        ) : (
                          <>
                            Continue Watching <ArrowRight size={16} />
                          </>
                        )}
                      </PrimaryBtn>
                    </div>
                  ) : Number(course.price) > 0 ? (
                    <div className="space-y-3">
                      <CouponInput
                        cartItems={[{ type: "course", id: course.id, quantity: 1 }]}
                        subtotal={Number(course.price)}
                        onCouponApplied={(result) => {
                          setCouponResult(result);
                        }}
                        onCouponRemoved={() => setCouponResult(null)}
                        appliedCoupon={couponResult ? {
                          code: couponResult.code,
                          discount_amount: couponResult.discount_amount,
                          discount_type: couponResult.discount_type,
                          discount_value: couponResult.discount_value,
                        } : null}
                      />
                      {couponResult && (
                        <div className="flex justify-between text-sm text-text-muted" aria-live="polite">
                          <span>Discount applied · payment fee included</span>
                          <span className="font-semibold text-text-main">{displayPrice(couponResult.final_total)}</span>
                        </div>
                      )}
                      <PrimaryBtn
                        type="button"
                        onClick={handleBuyCourse}
                        disabled={isPurchasing}
                        className="w-full justify-center mb-4"
                      >
                        {isPurchasing ? "PREPARING..." : "Buy Now"}{" "}
                        <ArrowRight size={16} />
                      </PrimaryBtn>
                    </div>
                    ) : (
                    <PrimaryBtn
                      type="button"
                      onClick={goToLesson}
                      className="w-full justify-center mb-4"
                    >
                      Enroll Now <ArrowRight size={16} />
                    </PrimaryBtn>
                  )}
                  {!isEnrolled && hasPreviewLesson && (
                    <GhostBtn
                      type="button"
                      onClick={goToPreviewLesson}
                      className="w-full justify-center"
                    >
                      Preview Free Lesson
                    </GhostBtn>
                  )}

                  <div className="mt-8 space-y-3">
                    {[
                      `${totalLessons} video lessons`,
                      `${formatDuration(course.total_duration_seconds)} of content`,
                      "Lifetime access",
                      "All devices",
                    ].map((f) => (
                      <div
                        key={f}
                        className="flex items-center gap-3 text-sm text-text-muted"
                      >
                        <Check size={14} className="text-gold shrink-0" /> {f}
                      </div>
                    ))}
                  </div>

                  {course.whatsapp_channel_url && (
                    <div className="mt-8 pt-6 border-t border-border">
                      <a
                        href={course.whatsapp_channel_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-label font-mono text-gold tracking-widest uppercase text-xs hover:underline"
                      >
                        Join WhatsApp Community →
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content below hero */}
      <div className="max-w-360 mx-auto px-8 lg:px-16 py-16">
        {course.description && (
          <RevealBlock>
            <div className="mb-16">
              <h2 className="text-text-main font-bold text-3xl mb-6">
                About This Course
              </h2>
              <p className="text-text-muted leading-relaxed whitespace-pre-line">
                {course.description}
              </p>
            </div>
          </RevealBlock>
        )}

        <RevealBlock>
          <div className="mb-16">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-10 h-10 border border-primary/20 flex items-center justify-center bg-gold-bg rounded">
                <BookOpen className="text-primary" size={18} />
              </div>
              <h2 className="text-text-main font-bold text-3xl">Curriculum</h2>
            </div>
            <div className="border border-border rounded">
              {sections.length === 0 && (
                <div className="p-6 text-text-muted text-sm">
                  Curriculum coming soon.
                </div>
              )}
              {sections.map((s, i) => {
                const prevLessonsCount = sections
                  .slice(0, i)
                  .reduce((sum, sec) => sum + (sec.lessons?.length ?? 0), 0);
                return (
                  <div
                    key={s.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <button
                      onClick={() =>
                        setOpenSection(openSection === i ? null : i)
                      }
                      className="w-full flex items-center justify-between p-6 text-left hover:bg-muted-light transition-colors"
                    >
                      <div>
                        <div className="text-label font-mono text-gold tracking-widest mb-1">
                          Section {i + 1}
                        </div>
                        <span className="text-text-main font-semibold">
                          {s.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-label font-mono text-text-muted">
                          {s.lessons?.length ?? 0} lessons
                        </span>
                        {openSection === i ? (
                          <Minus size={14} className="text-text-muted" />
                        ) : (
                          <Plus size={14} className="text-text-muted" />
                        )}
                      </div>
                    </button>
                    <AnimatePresence>
                      {openSection === i && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: "auto" }}
                          exit={{ height: 0 }}
                          transition={{ duration: 0.35 }}
                          className="overflow-hidden"
                        >
                          <div className="bg-dark-soft border-t border-border">
                            {s.lessons?.map((l, li) => {
                              const lessonNumber = prevLessonsCount + li + 1;
                              const hasVideo = !!l.computed_video_url;
                              const isPlayable =
                                (l.is_preview || isEnrolled) && hasVideo;
                              const linkHref = l.is_preview
                                ? `/courses/${course.slug}/lessons/${l.id}`
                                : user
                                  ? `/courses/${course.slug}/lessons/${l.id}`
                                  : loginHref;
                              const content = (
                                <>
                                  <div className="w-8 h-8 bg-muted border border-border flex items-center justify-center shrink-0">
                                    {hasVideo ? (
                                      <Play
                                        size={11}
                                        className="text-text-muted ml-0.5"
                                      />
                                    ) : (
                                      <X
                                        size={11}
                                        className="text-text-muted"
                                      />
                                    )}
                                  </div>
                                  <span
                                    className={`text-sm transition-colors ${isPlayable ? "text-blue-400 underline decoration-blue-400/40 underline-offset-2" : "text-text-muted"}`}
                                  >
                                    {lessonNumber}. {l.title}
                                  </span>
                                  <span className="ml-auto text-label font-mono text-text-muted">
                                    {formatDuration(l.video_duration_seconds)}
                                  </span>
                                </>
                              );
                              return isPlayable ? (
                                <Link
                                  key={l.id}
                                  href={linkHref}
                                  className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-muted-light transition-colors border-b border-border last:border-b-0"
                                >
                                  {content}
                                </Link>
                              ) : (
                                <div
                                  key={l.id}
                                  className="w-full flex items-center gap-4 px-6 py-4 text-left opacity-60 border-b border-border last:border-b-0 cursor-default"
                                >
                                  {content}
                                </div>
                              );
                            })}
                            {(!s.lessons || s.lessons.length === 0) && (
                              <div className="px-6 py-4 text-text-muted text-sm">
                                No lessons yet.
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </RevealBlock>

        <RevealBlock>
          <CourseReviewsSection
            courseSlug={slug}
            courseId={courseId!}
            isEnrolled={isEnrolled}
            isAuthenticated={!!user}
          />
        </RevealBlock>
      </div>

      <script src="https://checkout.razorpay.com/v1/checkout.js" async />

      <StatusModal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
        type={modalConfig.type}
        title={modalConfig.title}
        message={modalConfig.message}
        actionText={modalConfig.actionText}
        onAction={modalConfig.onAction}
      />
    </main>
  );
}
