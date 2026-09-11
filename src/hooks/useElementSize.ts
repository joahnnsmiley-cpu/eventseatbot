import { useEffect, useState, useRef } from 'react';

export type ElementSize = { width: number; height: number };

/**
 * Observed size of an element. Unlike useContainerWidth this reports height too,
 * which the venue map needs: it has to fit a plan of a known aspect ratio inside
 * a box whose height is set by the screen, not by the image.
 */
export function useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, ElementSize] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      setSize((prev) =>
        prev.width === el.offsetWidth && prev.height === el.offsetHeight
          ? prev
          : { width: el.offsetWidth, height: el.offsetHeight }
      );
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

/**
 * Largest box of the given aspect ratio that fits inside width x height.
 * This is what `object-fit: contain` does to an image — but as a real element,
 * so that percentage-positioned children land on the image rather than on the
 * letterboxed container around it.
 */
export function fitInside(width: number, height: number, aspectRatio: number): ElementSize {
  if (!(width > 0) || !(height > 0) || !(aspectRatio > 0)) return { width: 0, height: 0 };
  const w = Math.min(width, height * aspectRatio);
  return { width: w, height: w / aspectRatio };
}
