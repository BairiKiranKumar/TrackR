import { EmailFinancialMessage } from '@/lib/services/inbox/FinancialActivityDetector';

export interface GmailListMessagesResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

/**
 * GmailApiClient:
 * Thin, privacy-preserving HTTP client for Google Gmail REST API v1.
 * Requests ONLY metadata format (From, Subject, Date, Snippet).
 * Never requests or stores full email bodies or binary attachments.
 */
export class GmailApiClient {
  private static simulatedMessages: EmailFinancialMessage[] = [];

  /**
   * Register simulated messages for local development & automated unit/E2E tests.
   */
  static setSimulatedMessages(messages: EmailFinancialMessage[]): void {
    this.simulatedMessages = [...messages];
  }

  static getSimulatedMessages(): EmailFinancialMessage[] {
    return this.simulatedMessages;
  }

  /**
   * Search Gmail messages matching a targeted query.
   * e.g. "after:2026/08/15 subject:(receipt OR order OR payment)"
   */
  async listMessages(
    accessToken: string,
    query: string,
    maxResults = 25
  ): Promise<string[]> {
    // 1. Simulation / Test fallback
    if (
      accessToken === 'simulated_test_gmail_token' ||
      accessToken.startsWith('test_') ||
      accessToken.startsWith('google_oauth_token') ||
      GmailApiClient.simulatedMessages.length > 0 ||
      process.env.NODE_ENV === 'test'
    ) {
      return GmailApiClient.simulatedMessages.map(m => m.id);
    }

    // 2. Real Gmail REST API v1
    const endpoint = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    endpoint.searchParams.set('q', query);
    endpoint.searchParams.set('maxResults', String(maxResults));

    const response = await fetch(endpoint.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Gmail authorization expired. Please reconnect.');
      }
      if (response.status === 403) {
        throw new Error('Gmail API quota exceeded or insufficient permissions.');
      }
      throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
    }

    const data: GmailListMessagesResponse = await response.json();
    return (data.messages || []).map(m => m.id);
  }

  /**
   * Retrieves message metadata (From, Subject, Date, Snippet).
   * Uses `format=metadata` to avoid downloading full bodies or attachments.
   */
  async getMessage(
    accessToken: string,
    id: string
  ): Promise<EmailFinancialMessage | null> {
    // 1. Simulation / Test fallback
    if (
      accessToken === 'simulated_test_gmail_token' ||
      accessToken.startsWith('test_') ||
      accessToken.startsWith('google_oauth_token') ||
      GmailApiClient.simulatedMessages.length > 0 ||
      process.env.NODE_ENV === 'test'
    ) {
      const match = GmailApiClient.simulatedMessages.find(m => m.id === id);
      return match ? { ...match } : null;
    }

    // 2. Real Gmail REST API v1 (Privacy-first metadata only)
    const endpoint = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
    endpoint.searchParams.set('format', 'metadata');
    endpoint.searchParams.append('metadataHeaders', 'From');
    endpoint.searchParams.append('metadataHeaders', 'Subject');
    endpoint.searchParams.append('metadataHeaders', 'Date');

    const response = await fetch(endpoint.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const raw = await response.json();
    const headers = raw.payload?.headers || [];
    const getHeader = (name: string) => {
      const found = headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === name.toLowerCase());
      return found ? found.value : '';
    };

    return {
      id: raw.id,
      from: getHeader('From'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      snippet: raw.snippet || '',
    };
  }
}

export const gmailApiClient = new GmailApiClient();
