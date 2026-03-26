/**
 * Platform detection and user ID retrieval for Telegram and VK
 */

export type Platform = 'telegram' | 'vk';

export const getPlatform = (): Platform => {
    return (import.meta as any).env.VITE_PLATFORM === 'vk' ? 'vk' : 'telegram';
};

export const getPlatformUserId = (): string | number | undefined => {
    if (getPlatform() === 'vk') {
        // Note: On VK, we rely on the state being populated in App.tsx 
        // or we can try to look at window.vkBridge if needed.
        // However, for consistency, we'll often pass this from state.
        return undefined;
    }
    return (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
};
