import type { OrderItemQueueResponse } from '@/types/api';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Computes full days elapsed since an appliance became ready for pickup (or was rejected),
 * matching the backend abandonment eligibility reference timestamp.
 */
export function getWaitingDays(item: OrderItemQueueResponse): number {
  const referenceIso =
    item.status === 'READY_FOR_PICKUP' && item.finishedAt ? item.finishedAt : item.updatedAt;
  const referenceMs = Date.parse(referenceIso);
  if (Number.isNaN(referenceMs)) return 0;
  return Math.max(0, Math.floor((Date.now() - referenceMs) / MS_PER_DAY));
}
