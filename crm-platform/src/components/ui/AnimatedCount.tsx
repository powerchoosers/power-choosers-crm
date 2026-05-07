'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedCountProps {
  /** The target number to animate to */
  value: number;
  /** Animation duration in ms. Default 600 */
  duration?: number;
  /** CSS class name applied to the outer span */
  className?: string;
  /** Whether to animate on initial mount (0 → value). Default true */
  animateOnMount?: boolean;
}

/**
 * AnimatedCount — smoothly counts from a previous value to a new target.
 *
 * - On mount: counts 0 → value
 * - On value change: counts previousValue → newValue
 * - Uses requestAnimationFrame with an easeOutQuart curve
 */
export function AnimatedCount({
  value,
  duration = 600,
  className,
  animateOnMount = true,
}: AnimatedCountProps) {
  const [displayed, setDisplayed] = useState(animateOnMount ? 0 : value);
  const prevValueRef = useRef(animateOnMount ? 0 : value);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevValueRef.current;
    const to = value;

    // Nothing to animate
    if (from === to) return;

    // Cancel any in-flight animation
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    startTimeRef.current = null;

    const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

    const tick = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutQuart(progress);
      const current = Math.round(from + (to - from) * eased);

      setDisplayed(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevValueRef.current = to;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value, duration]);

  return <span className={className}>{displayed}</span>;
}
