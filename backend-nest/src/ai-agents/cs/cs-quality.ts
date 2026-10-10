import { Injectable } from '@nestjs/common';

export const CS_FALLBACK_MIN_SAMPLE = 10;
export const CS_FALLBACK_REJECT_RATE = 0.4;

export type CsQualitySnapshot = {
  accepted: number;
  rejected: number;
  escalated: number;
  rejectedRate: number;
  fallbackActive: boolean;
  helpful: number;
  notHelpful: number;
};

/**
 * In-process quality counters for the customer-service agent.
 * When rejections and handoffs pass the threshold, the ticket flow
 * returns to «مساعد سرح».
 */
@Injectable()
export class CsQualityService {
  private accepted = 0;
  private rejected = 0;
  private escalated = 0;
  private helpful = 0;
  private notHelpful = 0;

  note(kind: 'accepted' | 'rejected' | 'escalated'): void {
    this[kind] += 1;
  }

  rate(helpful: boolean): void {
    if (helpful) this.helpful += 1;
    else this.notHelpful += 1;
  }

  shouldFallback(): boolean {
    const total = this.accepted + this.rejected + this.escalated;
    if (total < CS_FALLBACK_MIN_SAMPLE) return false;
    return (this.rejected + this.escalated) / total >= CS_FALLBACK_REJECT_RATE;
  }

  snapshot(): CsQualitySnapshot {
    const total = this.accepted + this.rejected + this.escalated;
    return {
      accepted: this.accepted,
      rejected: this.rejected,
      escalated: this.escalated,
      rejectedRate: total ? (this.rejected + this.escalated) / total : 0,
      fallbackActive: this.shouldFallback(),
      helpful: this.helpful,
      notHelpful: this.notHelpful,
    };
  }
}
