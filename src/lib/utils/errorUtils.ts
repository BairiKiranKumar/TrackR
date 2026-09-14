/**
 * Translates technical database, network, and runtime exceptions into
 * clear, actionable, privacy-preserving messages for users.
 */

export interface FormattedError {
  title: string;
  message: string;
  code?: string;
  action?: 'retry' | 'signin' | 'reload' | 'backup';
}

export function formatUserFriendlyError(error: unknown): FormattedError {
  if (!error) {
    return {
      title: 'Unexpected State',
      message: 'An unknown issue occurred. Please try again.',
      action: 'retry',
    };
  }

  const msg = error instanceof Error ? error.message : String(error);
  const errObj = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  const code = (errObj.code as string) || (msg.match(/\b(23505|42501|23503|PGRST\w+)\b/)?.[1]);

  // Unique constraint violation (duplicate record)
  if (code === '23505' || msg.includes('duplicate key') || msg.includes('unique constraint')) {
    return {
      title: 'Already Exists',
      message: 'This record could not be saved because an item with the same identifier or key already exists.',
      code: 'ERR_DUPLICATE',
      action: 'retry',
    };
  }

  // Row Level Security / Permission violation
  if (code === '42501' || msg.includes('row-level security') || msg.includes('permission denied')) {
    return {
      title: 'Permission Denied',
      message: 'You do not have access to modify this record, or your cloud session needs to be refreshed.',
      code: 'ERR_PERMISSION',
      action: 'signin',
    };
  }

  // Foreign key violation
  if (code === '23503' || msg.includes('foreign key constraint')) {
    return {
      title: 'Reference Missing',
      message: 'This record links to an account, category, or project that could not be found.',
      code: 'ERR_FOREIGN_KEY',
      action: 'retry',
    };
  }

  // Session / JWT expiration
  if (code === 'PGRST301' || msg.includes('JWT expired') || msg.includes('Auth session missing') || msg.includes('invalid claim')) {
    return {
      title: 'Session Expired',
      message: 'Your cloud session has timed out. Please sign in again to sync your latest updates.',
      code: 'ERR_SESSION_EXPIRED',
      action: 'signin',
    };
  }

  // Network & Connectivity
  if (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('network error') ||
    msg.includes('timeout') ||
    msg.includes('offline')
  ) {
    return {
      title: 'Connection Offline',
      message: 'TRACKR could not reach the cloud server right now. All your changes are safe on this device and will sync automatically when back online.',
      code: 'ERR_NETWORK',
      action: 'retry',
    };
  }

  // Storage / Quota
  if (msg.includes('QuotaExceededError') || msg.includes('quota')) {
    return {
      title: 'Device Storage Full',
      message: 'Your browser storage quota has been reached. Please download a backup from Settings to safeguard your data.',
      code: 'ERR_STORAGE_QUOTA',
      action: 'backup',
    };
  }

  // CSV or JSON parsing
  if (msg.includes('JSON.parse') || msg.includes('Unexpected token') || msg.includes('malformed')) {
    return {
      title: 'Invalid File Format',
      message: 'The selected file could not be parsed. Please check that it is valid JSON or CSV and try again.',
      code: 'ERR_MALFORMED_INPUT',
      action: 'retry',
    };
  }

  // Default fallback (never leak stack traces or secrets)
  return {
    title: 'Operation Issue',
    message: msg.length < 160 ? msg : 'An unexpected error occurred while processing your request. Your local data remains intact.',
    code: 'ERR_RUNTIME',
    action: 'retry',
  };
}
