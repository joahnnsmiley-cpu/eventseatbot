/**
 * Telegram command parser and handler
 * Parses text messages for supported commands
 * Never throws - all errors are logged silently
 */

/**
 * Parsed command from text message
 */
export interface ParsedCommand {
  type: 'pending_payments' | 'booking_status' | 'unknown' | 'empty';
  bookingId?: string;
}

/**
 * Parse text message for Telegram commands
 * Supported commands:
 * - /pending_payments - List all pending payments
 * - /booking_status <bookingId> - Get booking status
 * 
 * Returns { type: 'unknown' } for unrecognized commands
 * Never throws
 */
export function parseCommand(text: string | undefined | null): ParsedCommand {
  try {
    // Handle empty or null text
    if (!text || typeof text !== 'string') {
      return { type: 'empty' };
    }

    // Trim whitespace
    const trimmed = text.trim();

    // Check if empty after trimming
    if (!trimmed) {
      return { type: 'empty' };
    }

    // Must start with /
    if (!trimmed.startsWith('/')) {
      return { type: 'unknown' };
    }

    // Parse command and arguments
    const parts = trimmed.split(/\s+/);
    const command = parts[0]?.toLowerCase() || '';

    // Handle /pending_payments command
    if (command === '/pending_payments') {
      return { type: 'pending_payments' };
    }

    // Handle /booking_status command
    if (command === '/booking_status') {
      const bookingId = parts[1];
      
      if (!bookingId) {
        // Missing argument
        return { type: 'unknown' };
      }

      return {
        type: 'booking_status',
        bookingId,
      };
    }

    // Unknown command
    return { type: 'unknown' };
  } catch (err) {
    // Never throw - log and return unknown
    console.error('[TelegramCommands] Error parsing command:', err);
    return { type: 'unknown' };
  }
}

/**
 * Check if a parsed command is known (should be handled)
 * Returns false for unknown and empty commands
 */
export function isKnownCommand(parsed: ParsedCommand): boolean {
  return parsed.type !== 'unknown' && parsed.type !== 'empty';
}

/**
 * Check if a parsed command should be processed
 * Filters out empty commands but keeps unknown for logging
 */
export function shouldProcessCommand(parsed: ParsedCommand): boolean {
  return parsed.type !== 'empty';
}
