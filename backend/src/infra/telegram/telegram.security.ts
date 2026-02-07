/**
 * Telegram Security Module
 * Validates admin commands are only processed from authorized chat IDs
 */

/**
 * Check if a chat ID is authorized to send admin commands
 * Reads TELEGRAM_ADMIN_CHAT_ID from environment
 * Returns false if not configured or chat ID doesn't match
 * Never throws
 */
export function isAuthorizedAdminChat(chatId: number | string | null | undefined): boolean {
  try {
    // Get admin chat ID from environment
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    
    // No admin chat ID configured - deny access
    if (!adminChatId) {
      return false;
    }

    // No chat ID provided - deny access
    if (chatId === null || chatId === undefined) {
      return false;
    }

    // Convert to string for comparison (handles both number and string)
    const chatIdStr = String(chatId).trim();
    const adminChatIdStr = adminChatId.trim();

    // Exact match required
    return chatIdStr === adminChatIdStr;
  } catch (err) {
    console.error('[TelegramSecurity] Error validating chat ID:', err);
    return false;
  }
}

/**
 * Get the configured admin chat ID
 * Used for testing and logging
 * Returns null if not configured
 * Never throws
 */
export function getConfiguredAdminChatId(): string | null {
  try {
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    return adminChatId ? adminChatId.trim() : null;
  } catch (err) {
    console.error('[TelegramSecurity] Error getting admin chat ID:', err);
    return null;
  }
}

/**
 * Log unauthorized access attempt
 * Used for security monitoring
 * Never throws
 */
export function logUnauthorizedCommand(
  chatId: number | string | null | undefined,
  command: string,
): void {
  try {
    const configuredId = getConfiguredAdminChatId();
    const incomingId = chatId === null || chatId === undefined ? 'unknown' : String(chatId);
    
    console.warn(
      `[TelegramSecurity] Unauthorized command attempt: command=${command}, ` +
      `chatId=${incomingId}, authorizedChatId=${configuredId || 'not-configured'}`,
    );
  } catch (err) {
    console.error('[TelegramSecurity] Error logging unauthorized access:', err);
  }
}
