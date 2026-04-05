import { notifyAdmins as notifyTelegramAdmins, sendTelegramMessage } from './telegramService';
import { notifyVkAdmins, sendVkMessage } from './vkService';
import { getOrganizersByEvent } from '../db-postgres';

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

/**
 * Notify all admins (all platforms) + event-specific organizers (TG and VK).
 * Used for booking/payment notifications so organizers are alerted alongside global admins.
 */
export async function notifyEventStakeholders(eventId: string, text: string): Promise<void> {
    // 1. All global admins on all platforms (existing behavior)
    await notifyAllAdmins(text).catch((err) =>
        console.error('[NotificationService] notifyAllAdmins failed:', err)
    );

    // 2. Organizers assigned to this specific event (additional recipients)
    const organizers = await getOrganizersByEvent(eventId).catch(() => []);
    if (organizers.length === 0) return;

    await Promise.allSettled(
        organizers.map(async (org) => {
            if (org.platform === 'telegram') {
                await sendTelegramMessage(String(org.userId), text);
            } else if (org.platform === 'vk') {
                await sendVkMessage(org.userId, text);
            }
        })
    ).then((results) => {
        results.forEach((result, i) => {
            if (result.status === 'rejected') {
                console.error(
                    `[NotificationService] Failed to notify organizer ${organizers[i]?.userId} (${organizers[i]?.platform}):`,
                    result.reason
                );
            }
        });
    });
}
