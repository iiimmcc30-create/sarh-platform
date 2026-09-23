import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { throwApi } from '../../common/exceptions/api.exception';

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready'],
  ready: ['delivered'],
  delivered: [],
  cancelled: [],
};

@Injectable()
export class OrderStateMachineService {
  getAllowedNext(status: OrderStatus): OrderStatus[] {
    return ALLOWED_TRANSITIONS[status] ?? [];
  }

  canTransition(from: OrderStatus, to: OrderStatus): boolean {
    if (from === to) return true;
    return this.getAllowedNext(from).includes(to);
  }

  assertTransition(from: OrderStatus, to: OrderStatus): void {
    if (from === to) return;
    if (!this.canTransition(from, to)) {
      throwApi(
        409,
        'invalid_order_transition',
        `لا يمكن تغيير حالة الطلب من ${from} إلى ${to}`,
        {
          from,
          to,
          allowedNext: this.getAllowedNext(from),
        },
      );
    }
  }
}
