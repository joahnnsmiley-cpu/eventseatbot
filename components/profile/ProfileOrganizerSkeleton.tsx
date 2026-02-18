import React from 'react';
import ProfileLayout from './ProfileLayout';
import ProfileCard from './ProfileCard';
import ProfileSectionSkeleton from './ProfileSectionSkeleton';

/** Full-page skeleton for organizer profile during initial load. */
export default function ProfileOrganizerSkeleton() {
  return (
    <ProfileLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <ProfileCard padding={32} rounded={28} variant="glass">
          <ProfileSectionSkeleton title={false} rows={2} columns={1} />
        </ProfileCard>
        <ProfileCard padding={24} rounded={24} variant="glass">
          <ProfileSectionSkeleton title rows={1} columns={1} />
        </ProfileCard>
        <ProfileCard padding={24} rounded={24} variant="glass">
          <ProfileSectionSkeleton title rows={1} columns={3} />
        </ProfileCard>
        <ProfileCard padding={24} rounded={24} variant="glass">
          <ProfileSectionSkeleton title rows={1} columns={4} />
        </ProfileCard>
      </div>
    </ProfileLayout>
  );
}
