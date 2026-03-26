import { notifyAdmins as notifyTelegramAdmins } from './telegramService';
import { notifyVkAdmins } from './vkService';

/**
 * Sends a notification to all admins on all supported platforms (Telegram and VK).
 * This ensures that admins are alerted regardless of which bot they are monitoring.
 */
export async function notifyAllAdmins(text: string): Promise<void> {
    // We use Promise.allSettled to ensure that a failure on one platform doesn't block the other.
    const results = await Promise.allSettled([
        notifyTelegramAdmins(text),
        notifyVkAdmins(text),
    ]);

    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            const platform = index === 0 ? 'Telegram' : 'VK';
            console.error(`[NotificationService] Failed to notify ${platform} admins:`, result.reason);
        }
    });
}
