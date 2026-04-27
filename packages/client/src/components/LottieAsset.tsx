/**
 * LottieAsset — lightweight wrapper around lottie-react.
 *
 * Why a wrapper:
 *  - **Dynamic imports `lottie-react`** so the ~90kB-gzip runtime is a
 *    separate chunk — users who never hit an animated screen don't pay
 *    for it at all.
 *  - Lazy-fetches JSON from /public/lottie so the main bundle stays small.
 *  - Holds a module-level cache so the same asset across routes re-uses a
 *    single fetch (confetti.json is 600kb — we don't want to re-download).
 *  - Renders a pluggable fallback (emoji, icon) while loading AND on error.
 *  - Respects `prefers-reduced-motion` — shows the first frame only.
 *  - Only animates when visible (IntersectionObserver) to save CPU on
 *    long scrolling screens.
 *
 * Props mirror a sane subset of lottie-react, with extras for fallback UI.
 */
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

// Lazy-load lottie-react so it's code-split out of the main bundle.
// The fallback branch below renders the user-supplied fallback while the
// chunk + JSON are both in-flight, so there's never a blank frame.
const Lottie = lazy(() => import('lottie-react'));
type LottieRefCurrentProps = {
  setSpeed: (n: number) => void;
  goToAndStop: (frame: number, isFrame?: boolean) => void;
};

type LottieJson = Record<string, unknown>;

const cache = new Map<string, LottieJson>();
const inflight = new Map<string, Promise<LottieJson>>();

function loadLottie(src: string): Promise<LottieJson> {
  const cached = cache.get(src);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(src);
  if (existing) return existing;
  const p = fetch(src)
    .then((r) => {
      if (!r.ok) throw new Error(`lottie fetch ${r.status}`);
      return r.json() as Promise<LottieJson>;
    })
    .then((data) => {
      cache.set(src, data);
      inflight.delete(src);
      return data;
    })
    .catch((err) => {
      inflight.delete(src);
      throw err;
    });
  inflight.set(src, p);
  return p;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export interface LottieAssetProps {
  /** Path under /public (e.g. '/lottie/trophy.json') or absolute URL. */
  src: string;
  /** Box size — applied to both width and height unless width/height given. */
  size?: number | string;
  width?: number | string;
  height?: number | string;
  /** Loop playback. Default true. */
  loop?: boolean;
  /** Autoplay on mount. Default true. */
  autoplay?: boolean;
  /** Playback speed multiplier. Default 1. */
  speed?: number;
  /** Shown while loading or on error (e.g. the original emoji). */
  fallback?: ReactNode;
  /** Extra className for the wrapping div. */
  className?: string;
  /** Extra style for the wrapping div. */
  style?: CSSProperties;
  /** Fired when the animation finishes a single play (only fires when loop=false). */
  onComplete?: () => void;
}

export default function LottieAsset({
  src,
  size,
  width,
  height,
  loop = true,
  autoplay = true,
  speed = 1,
  fallback = null,
  className,
  style,
  onComplete,
}: LottieAssetProps) {
  const [data, setData] = useState<LottieJson | null>(() => cache.get(src) || null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);
  const reduced = prefersReducedMotion();

  // Observe visibility so we only animate things on-screen.
  useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            return;
          }
        }
      },
      { threshold: 0.05 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  // Fetch the JSON once visible.
  useEffect(() => {
    if (!visible || data || failed) return;
    let mounted = true;
    loadLottie(src)
      .then((d) => {
        if (mounted) setData(d);
      })
      .catch(() => {
        if (mounted) setFailed(true);
      });
    return () => {
      mounted = false;
    };
  }, [visible, src, data, failed]);

  // Apply speed when data is ready.
  useEffect(() => {
    lottieRef.current?.setSpeed(speed);
  }, [speed, data]);

  // Freeze to first frame when user prefers reduced motion.
  useEffect(() => {
    if (!reduced || !data || !lottieRef.current) return;
    lottieRef.current.goToAndStop(0, true);
  }, [reduced, data]);

  const w = width ?? size ?? '100%';
  const h = height ?? size ?? '100%';
  const wrapStyle: CSSProperties = {
    width: w,
    height: h,
    display: 'inline-block',
    lineHeight: 0,
    ...style,
  };

  if (failed || !data) {
    return (
      <div ref={wrapRef} className={className} style={wrapStyle} aria-hidden>
        {fallback}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={className} style={wrapStyle} aria-hidden>
      <Suspense fallback={<>{fallback}</>}>
        <Lottie
          lottieRef={lottieRef}
          animationData={data}
          loop={reduced ? false : loop}
          autoplay={reduced ? false : autoplay}
          onComplete={onComplete}
          style={{ width: '100%', height: '100%' }}
          rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
        />
      </Suspense>
    </div>
  );
}
