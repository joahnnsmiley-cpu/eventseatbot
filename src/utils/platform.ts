/**
 * Platform detection and user ID retrieval for Telegram and VK
 */

export type Platform = 'telegram' | 'vk';

export const getPlatform = (): Platform => {
    if (typeof window !== 'undefined') {
        const search = window.location.search;
        if (search.includes('vk_user_id') || search.includes('vk_app_id')) return 'vk';
        if ((window as any).Telegram?.WebApp?.initData) return 'telegram';
    }
    return (import.meta as any).env.VITE_PLATFORM === 'vk' ? 'vk' : 'telegram';
};

export const getPlatformUserId = (): string | number | undefined => {
    if (getPlatform() === 'vk') {
        const params = new URLSearchParams(window.location.search);
        return params.get('vk_user_id') || undefined;
    }
    return (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
};
