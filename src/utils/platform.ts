/**
 * Platform detection and user ID retrieval for Telegram and VK
 */

export type Platform = 'telegram' | 'vk';

export const getPlatform = (): Platform => {
    if (typeof window !== 'undefined') {
        const fullUrl = window.location.search + window.location.hash;
        if (fullUrl.includes('vk_user_id') || fullUrl.includes('vk_app_id')) return 'vk';
        if ((window as any).Telegram?.WebApp?.initData) return 'telegram';
    }
    return (import.meta as any).env.VITE_PLATFORM === 'vk' ? 'vk' : 'telegram';
};

export const getPlatformUserId = (): string | number | undefined => {
    if (getPlatform() === 'vk') {
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        return searchParams.get('vk_user_id') || hashParams.get('vk_user_id') || undefined;
    }
    return (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
};
