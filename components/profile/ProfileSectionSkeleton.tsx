import React from 'react';
import Skeleton from '../../src/ui/Skeleton';
import { radius, spacing } from '../../design/theme';

export default function ProfileSectionSkeleton({
  title = true,
  rows = 3,
  columns = 4,
}: {
  title?: boolean;
  rows?: number;
  columns?: number;
}) {
  return (
    <div style={{ marginBottom: spacing[4] }}>
      {title && (
        <Skeleton height={12} width={100} borderRadius={radius.sm} style={{ marginBottom: spacing[3] }} />
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: spacing[3],
        }}
      >
        {Array.from({ length: rows * columns }).map((_, i) => (
          <Skeleton
            key={i}
            height={columns === 1 ? 48 : 56}
            borderRadius={radius.md}
          />
        ))}
      </div>
    </div>
  );
}
