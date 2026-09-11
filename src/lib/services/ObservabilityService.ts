import { DiagnosticCategory, DiagnosticEvent } from '@/types';
import { saveDiagnosticEvent, getRecentDiagnosticEvents, clearDiagnosticEvents, getAllDiagnosticEvents } from '@/lib/db/localDb';

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /auth/i,
  /key/i,
  /credential/i,
  /bearer/i,
  /cookie/i,
  /session/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
}

export function sanitizeValue(val: unknown, depth = 0): unknown {
  if (depth > 5) return '[Truncated]';
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    // Redact JWT or long tokens
    if (/^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/.test(val) && val.length > 30) {
      return '[REDACTED_JWT]';
    }
    // Redact email strings if they might be sensitive
    return val;
  }
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (Array.isArray(val)) {
    return val.map(item => sanitizeValue(item, depth + 1));
  }
  if (typeof val === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        sanitized[k] = '[REDACTED]';
      } else {
        sanitized[k] = sanitizeValue(v, depth + 1);
      }
    }
    return sanitized;
  }
  return String(val);
}

export function sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details) return undefined;
  return sanitizeValue(details) as Record<string, unknown>;
}

type DiagnosticListener = (event: DiagnosticEvent) => void;

class ObservabilityService {
  private listeners: Set<DiagnosticListener> = new Set();

  public subscribe(listener: DiagnosticListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async logEvent(params: {
    category: DiagnosticCategory;
    message: string;
    entityType?: string;
    entityId?: string;
    details?: Record<string, unknown>;
  }): Promise<DiagnosticEvent> {
    const event: DiagnosticEvent = {
      id: genId(),
      category: params.category,
      message: params.message.slice(0, 500),
      entityType: params.entityType,
      entityId: params.entityId,
      details: sanitizeDetails(params.details),
      timestamp: new Date().toISOString(),
    };

    try {
      await saveDiagnosticEvent(event);
    } catch (err) {
      // In tests or edge environments where DB is uninitialized, do not throw
      console.warn('Failed to persist diagnostic event:', err);
    }

    this.listeners.forEach(fn => {
      try { fn(event); } catch (e) { console.error('Diagnostic listener error:', e); }
    });

    return event;
  }

  public async getRecentEvents(limit = 50): Promise<DiagnosticEvent[]> {
    return getRecentDiagnosticEvents(limit);
  }

  public async getEventsByCategory(category: DiagnosticCategory, limit = 50): Promise<DiagnosticEvent[]> {
    const all = await getAllDiagnosticEvents();
    return all
      .filter(e => e.category === category)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  public async clear(): Promise<void> {
    return clearDiagnosticEvents();
  }
}

export const observabilityService = new ObservabilityService();
