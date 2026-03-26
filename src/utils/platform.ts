/**
 * Aggressively extracts a parameter value from the entire URL (search + hash)
 */
export const extractParam = (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    const url = window.location.href;
    const regex = new RegExp(`[?&]${key}=([^&#]*)`);
    const match = url.match(regex);
    return match ? decodeURIComponent(match[1]) : null;
};

export const getPlatform = (): 'telegram' | 'vk' | 'web' => {
    if (typeof window !== 'undefined') {
        const fullUrl = window.location.href;
        if (fullUrl.includes('vk_user_id') || fullUrl.includes('vk_app_id')) return 'vk';
        if ((window as any).Telegram?.WebApp?.initData) return 'telegram';
        if (fullUrl.includes('tgWebAppStartParam')) return 'telegram';
    }
    // Fallback to env variable if set, otherwise web
    const envPlatform = (import.meta as any).env.VITE_PLATFORM;
    if (envPlatform === 'vk') return 'vk';
    if (envPlatform === 'telegram') return 'telegram';
    return 'web';
};

export const getPlatformUserId = (): string | null => {
    if (typeof window === 'undefined') return null;
    const platform = getPlatform();
    if (platform === 'telegram') {
        const tg = (window as any).Telegram?.WebApp;
        return tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : null;
    }
    if (platform === 'vk') {
        return extractParam('vk_user_id');
    }
    return null;
};
