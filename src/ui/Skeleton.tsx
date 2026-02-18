import React from 'react';
import { radius } from '../../design/theme';

const SHIMMER_STYLE = `
@keyframes skeleton-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton-shimmer {
  background: linear-gradient(90deg, rgba(229,231,235,0.6) 25%, rgba(243,244,246,0.8) 50%, rgba(229,231,235,0.6) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.2s infinite;
}
.skeleton-shimmer-dark {
  background: linear-gradient(90deg, rgba(60,60,60,0.6) 25%, rgba(80,80,80,0.8) 50%, rgba(60,60,60,0.6) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.2s infinite;
}
`;

type SkeletonProps = {
  className?: string;
  style?: React.CSSProperties;
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
  dark?: boolean;
};

export default function Skeleton({
  className = '',
  style,
  width,
  height,
  borderRadius = radius.md,
  dark = false,
}: SkeletonProps) {
  return (
    <>
      <style>{SHIMMER_STYLE}</style>
      <div
        className={`skeleton-shimmer ${dark ? 'skeleton-shimmer-dark' : ''} ${className}`}
        style={{
          width: width ?? '100%',
          height: height ?? 48,
          borderRadius,
          ...style,
        }}
        aria-hidden
      />
    </>
  );
}
