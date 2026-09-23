import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { LoggerService } from '../../common/services/logger.service';
import { OrderLifecycleService } from './order-lifecycle.service';

const DEFAULT_UNPAID_ORDER_EXPIRY_MINUTES = 30;
const DEFAULT_EXPIRY_CHECK_INTERVAL_MS = 5 * 60 * 1000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class UnpaidOrderExpiryService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly orders: OrderLifecycleService,
    private readonly logger: LoggerService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    if (process.env.SERVICE_MODE === 'socket') return;
    if (process.env.RUN_UNPAID_ORDER_EXPIRY === 'false') return;

    const intervalMs = parsePositiveInt(
      process.env.BUTCHER_ORDER_EXPIRY_CHECK_INTERVAL_MS,
      DEFAULT_EXPIRY_CHECK_INTERVAL_MS,
    );

    this.timer = setInterval(() => {
      void this.run();
    }, intervalMs);

    void this.run();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    if (this.running) return;
    this.running = true;

    try {
      const expiryMinutes = parsePositiveInt(
        process.env.BUTCHER_ORDER_UNPAID_EXPIRES_MINUTES,
        DEFAULT_UNPAID_ORDER_EXPIRY_MINUTES,
      );
      const cutoff = new Date(Date.now() - expiryMinutes * 60 * 1000);
      const [orders, checkouts] = await Promise.all([
        this.orders.expireStaleUnpaidOrders(cutoff),
        this.orders.expireStaleCheckouts(new Date()),
      ]);
      if (
        orders.expired > 0 ||
        orders.scanned > 0 ||
        checkouts.expired > 0 ||
        checkouts.scanned > 0
      ) {
        this.logger.info(
          { expiryMinutes, orders, checkouts },
          'Unpaid butcher order and checkout expiry pass completed',
        );
      }
    } catch (err) {
      this.logger.error({ err }, 'Unpaid butcher order expiry pass failed');
    } finally {
      this.running = false;
    }
  }
}
