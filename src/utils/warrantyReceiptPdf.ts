import { Linking, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { financeApi, tenantSettingsApi } from '@/api/endpoints';
import { API_BASE_URL } from '@/api/http';
import type { Locale } from '@/i18n/translations';
import type {
  ItemStatus,
  OrderPaymentMethod,
  ServiceOrderItemResponse,
  ServiceOrderResponse,
  TenantResponse,
  TenantSettingsResponse,
  TransactionPaymentMethod,
} from '@/types/api';

export interface ReceiptPaymentPart {
  paymentMethod: OrderPaymentMethod | TransactionPaymentMethod;
  amount: number;
}

export interface WarrantyInfo {
  hasWarranty: boolean;
  deliveredDate: Date;
  expiryDate: Date | null;
  warrantyDays: number;
  daysRemaining: number;
  isActive: boolean;
}

export interface BuildOrderWarrantyReceiptParams {
  tenant: TenantResponse;
  settings?: TenantSettingsResponse | null;
  order: ServiceOrderResponse;
  deliveredItems: ServiceOrderItemResponse[];
  payments: ReceiptPaymentPart[];
  locale: Locale;
}

export interface ShareOrderWarrantyReceiptParams {
  tenant: TenantResponse;
  settings?: TenantSettingsResponse | null;
  order: ServiceOrderResponse;
  locale: Locale;
  /**
   * Optional override for newly delivered item(s) whose async financial
   * transactions might still be committing in the backend outbox.
   */
  overrideItem?: ServiceOrderItemResponse;
  overrideItemPayments?: ReceiptPaymentPart[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeWarrantyInfo(item: ServiceOrderItemResponse): WarrantyInfo {
  const deliveredDate = item.deliveredAt ? new Date(item.deliveredAt) : new Date();
  const isPaidRepair = Number(item.totalPrice) > 0 && item.warrantyDays > 0;

  if (!isPaidRepair) {
    return {
      hasWarranty: false,
      deliveredDate,
      expiryDate: null,
      warrantyDays: 0,
      daysRemaining: 0,
      isActive: false,
    };
  }

  const expiryDate = new Date(deliveredDate.getTime() + item.warrantyDays * MS_PER_DAY);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfExpiry = new Date(
    expiryDate.getFullYear(),
    expiryDate.getMonth(),
    expiryDate.getDate()
  ).getTime();
  const daysRemaining = Math.ceil((startOfExpiry - startOfToday) / MS_PER_DAY);

  return {
    hasWarranty: true,
    deliveredDate,
    expiryDate,
    warrantyDays: item.warrantyDays,
    daysRemaining: Math.max(0, daysRemaining),
    isActive: daysRemaining >= 0,
  };
}

export function formatFullDate(date: Date, locale: Locale): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return locale === 'en' ? `${year}-${month}-${day}` : `${day}/${month}/${year}`;
}

export function formatDateTime(date: Date, locale: Locale): string {
  const datePart = formatFullDate(date, locale);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${datePart} ${hours}:${minutes}`;
}

function escapeHtml(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(amount: number, locale: Locale): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = safe.toFixed(2);
  if (locale === 'pt-BR') {
    const [intPart, decPart] = formatted.split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `R$ ${grouped},${decPart}`;
  }
  const [intPart, decPart] = formatted.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `R$ ${grouped}.${decPart}`;
}

function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = raw.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

function formatDocumentDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = raw.replace(/\D/g, '');
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return raw;
}

function formatPaymentMethodLabel(
  method: OrderPaymentMethod | TransactionPaymentMethod,
  locale: Locale
): string {
  const pt: Record<TransactionPaymentMethod, string> = {
    PIX: 'Pix',
    CREDIT_CARD: 'Cartão de Crédito',
    DEBIT_CARD: 'Cartão de Débito',
    CASH: 'Dinheiro',
    STORE_CREDIT: 'Fiado',
  };
  const en: Record<TransactionPaymentMethod, string> = {
    PIX: 'Pix',
    CREDIT_CARD: 'Credit Card',
    DEBIT_CARD: 'Debit Card',
    CASH: 'Cash',
    STORE_CREDIT: 'Store Credit',
  };
  return locale === 'pt-BR' ? pt[method] : en[method];
}

function formatVoltageLabel(voltage: ServiceOrderItemResponse['voltage']): string {
  switch (voltage) {
    case 'V110':
      return '110V';
    case 'V220':
      return '220V';
    case 'BIVOLT':
      return 'Bivolt';
    case 'BATTERY':
      return 'Bateria';
    default:
      return 'N/I';
  }
}

function formatStatusLabel(status: ItemStatus, locale: Locale): string {
  const pt: Record<ItemStatus, string> = {
    RECEIVED: 'Recebido',
    DIAGNOSING: 'Diagnóstico',
    QUOTE_SENT: 'Orçamento',
    APPROVED: 'Aprovado',
    WAITING_PARTS: 'Aguard. Peça',
    IN_REPAIR: 'Em Conserto',
    READY_FOR_PICKUP: 'Pronto p/ Retirada',
    DELIVERED: 'Entregue',
    REJECTED: 'Recusado',
    DISCARDED: 'Descartado',
    CANCELLED: 'Cancelado',
  };
  const en: Record<ItemStatus, string> = {
    RECEIVED: 'Received',
    DIAGNOSING: 'Diagnosing',
    QUOTE_SENT: 'Quote Sent',
    APPROVED: 'Approved',
    WAITING_PARTS: 'Waiting Parts',
    IN_REPAIR: 'In Repair',
    READY_FOR_PICKUP: 'Ready for Pickup',
    DELIVERED: 'Delivered',
    REJECTED: 'Rejected',
    DISCARDED: 'Discarded',
    CANCELLED: 'Cancelled',
  };
  return locale === 'pt-BR' ? pt[status] : en[status];
}

function consolidatePayments(parts: ReceiptPaymentPart[]): ReceiptPaymentPart[] {
  const totals = new Map<OrderPaymentMethod | TransactionPaymentMethod, number>();
  for (const part of parts) {
    const amount = Number(part.amount) || 0;
    if (amount <= 0) continue;
    totals.set(part.paymentMethod, Math.round(((totals.get(part.paymentMethod) ?? 0) + amount) * 100) / 100);
  }
  return Array.from(totals.entries()).map(([paymentMethod, amount]) => ({
    paymentMethod,
    amount,
  }));
}

function toSignatureDataUri(svg: string | null | undefined): string {
  if (!svg) return '';
  const trimmed = svg.trim();
  if (!trimmed.startsWith('<svg')) return '';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
}

function sanitizeRasterDataUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed;
  }
  return '';
}

export function buildOrderWarrantyReceiptHtml({
  tenant,
  settings,
  order,
  deliveredItems,
  payments,
  locale,
}: BuildOrderWarrantyReceiptParams): string {
  const isPt = locale === 'pt-BR';
  const sortedDelivered = [...deliveredItems].sort((a, b) => a.itemIndex - b.itemIndex);
  const deliveredIds = new Set(sortedDelivered.map((i) => i.id));
  const pendingItems = order.items
    .filter((i) => !deliveredIds.has(i.id))
    .sort((a, b) => a.itemIndex - b.itemIndex);

  const consolidatedPayments = consolidatePayments(payments);
  const totalLabor = sortedDelivered.reduce((acc, i) => acc + (Number(i.laborCost) || 0), 0);
  const totalParts = sortedDelivered.reduce((acc, i) => acc + (Number(i.partsCost) || 0), 0);
  const totalDiscount = sortedDelivered.reduce((acc, i) => acc + (Number(i.discount) || 0), 0);
  const grandTotal = sortedDelivered.reduce((acc, i) => acc + (Number(i.totalPrice) || 0), 0);
  const isAllFreeReturn = grandTotal <= 0;

  const warrantyEntries = sortedDelivered.map((item) => ({
    item,
    warranty: computeWarrantyInfo(item),
  }));
  const coveredEntries = warrantyEntries.filter((e) => e.warranty.hasWarranty && e.warranty.expiryDate);

  const latestDeliveryDate = warrantyEntries.reduce<Date>(
    (latest, entry) =>
      entry.warranty.deliveredDate.getTime() > latest.getTime()
        ? entry.warranty.deliveredDate
        : latest,
    warrantyEntries[0]?.warranty.deliveredDate ?? new Date()
  );

  const uniqueExpiryLabels = Array.from(
    new Set(
      coveredEntries
        .map((e) => (e.warranty.expiryDate ? formatFullDate(e.warranty.expiryDate, locale) : null))
        .filter((v): v is string => Boolean(v))
    )
  );
  const singleWarrantyEntry = coveredEntries.length > 0 && uniqueExpiryLabels.length === 1
    ? coveredEntries[0]
    : null;

  const trackingUrl = `${API_BASE_URL}/track/${order.publicToken}`;
  const docFormatted = formatDocumentDisplay(tenant.document);
  const docTitle = isPt
    ? `Comprovante e Garantia - OS #${order.orderNumber}`
    : `Delivery Receipt & Warranty - Order #${order.orderNumber}`;

  const itemCountBadge =
    sortedDelivered.length === 1
      ? isPt
        ? '1 aparelho entregue'
        : '1 delivered item'
      : isPt
        ? `${sortedDelivered.length} aparelhos entregues`
        : `${sortedDelivered.length} delivered items`;

  const itemsCardsHtml = warrantyEntries
    .map(({ item, warranty }) => {
      const title = [item.applianceType, item.brand, item.model].filter(Boolean).join(' ');
      const itemTotal = Number(item.totalPrice) || 0;
      const metaBits = [
        `${isPt ? 'Voltagem' : 'Voltage'}: ${formatVoltageLabel(item.voltage)}`,
        item.serialNumber ? `S/N: ${item.serialNumber}` : null,
        item.accessories ? `${isPt ? 'Acessórios' : 'Accessories'}: ${item.accessories}` : null,
      ].filter(Boolean);

      const warrantyBadgeHtml =
        warranty.hasWarranty && warranty.expiryDate
          ? `<span class="item-warranty-badge">${
              isPt
                ? `Garantia ${warranty.warrantyDays}d · até ${escapeHtml(formatFullDate(warranty.expiryDate, locale))}`
                : `${warranty.warrantyDays}d warranty · until ${escapeHtml(formatFullDate(warranty.expiryDate, locale))}`
            }</span>`
          : `<span class="item-warranty-badge neutral">${
              isPt ? 'Devolução sem garantia' : 'Zero-charge return'
            }</span>`;

      return `
        <div class="item-block">
          <div class="item-head">
            <div class="item-head-left">
              <span class="item-tag">#${escapeHtml(item.tag)}</span>
              <span class="item-title">${escapeHtml(title)}</span>
            </div>
            <div class="item-head-right">
              ${warrantyBadgeHtml}
              <span class="item-price">${escapeHtml(formatMoney(itemTotal, locale))}</span>
            </div>
          </div>

          <div class="item-meta-line">
            ${escapeHtml(metaBits.join(' · '))} · ${isPt ? 'Entregue em' : 'Delivered'} ${escapeHtml(formatDateTime(warranty.deliveredDate, locale))}
          </div>

          <div class="item-report-grid">
            <div class="item-report-col">
              <div class="report-sub">${isPt ? 'Defeito Relatado' : 'Reported Issue'}</div>
              <p class="report-text">${escapeHtml(item.reportedIssue)}</p>
            </div>
            <div class="item-report-col">
              <div class="report-sub">${isPt ? 'Diagnóstico / Serviço Executado' : 'Diagnosis / Service Performed'}</div>
              <p class="report-text">${escapeHtml(
                item.technicalDiagnosis ||
                  (itemTotal <= 0
                    ? isPt
                      ? 'Aparelho devolvido sem execução de reparo.'
                      : 'Appliance returned without repair.'
                    : isPt
                      ? 'Serviço técnico concluído conforme orçamento aprovado.'
                      : 'Technical service completed as approved.')
              )}</p>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  const pendingItemsNoteHtml =
    pendingItems.length > 0
      ? `
        <div class="pending-note">
          <strong>${
            isPt
              ? 'Outros itens desta OS (ainda não entregues):'
              : 'Other items in this order (not yet delivered):'
          }</strong>
          ${pendingItems
            .map((p) => {
              const label = [p.applianceType, p.brand, p.model].filter(Boolean).join(' ');
              return `#${escapeHtml(p.tag)} ${escapeHtml(label)} (${escapeHtml(formatStatusLabel(p.status, locale))})`;
            })
            .join(' · ')}
        </div>
      `
      : '';

  const paymentPillsHtml = isAllFreeReturn
    ? `<span class="pay-pill neutral">${isPt ? 'Devolução sem cobrança' : 'Zero-charge return'}</span>`
    : consolidatedPayments.length > 0
      ? consolidatedPayments
          .map(
            (p) =>
              `<span class="pay-pill">${escapeHtml(
                formatPaymentMethodLabel(p.paymentMethod, locale)
              )}: <strong>${escapeHtml(formatMoney(p.amount, locale))}</strong></span>`
          )
          .join('')
      : `<span class="pay-pill">${isPt ? 'Quitado na entrega' : 'Paid upon delivery'}</span>`;

  const warrantySectionHtml =
    coveredEntries.length > 0
      ? `
      <section class="warranty-box">
        <div class="warranty-top">
          <div>
            <div class="warranty-tag">${isPt ? 'CERTIFICADO E TERMO DE GARANTIA' : 'WARRANTY CERTIFICATE'}</div>
            <div class="warranty-heading">${
              isPt ? 'Garantia Legal e de Serviço' : 'Repair Service Warranty'
            }</div>
          </div>
          ${
            singleWarrantyEntry && singleWarrantyEntry.warranty.expiryDate
              ? `
                <div class="warranty-seal">
                  <div class="seal-label">${isPt ? 'VÁLIDA ATÉ' : 'VALID UNTIL'}</div>
                  <div class="seal-date">${escapeHtml(formatFullDate(singleWarrantyEntry.warranty.expiryDate, locale))}</div>
                </div>
              `
              : `
                <div class="warranty-seal">
                  <div class="seal-label">${isPt ? 'ITENS COBERTOS' : 'COVERED ITEMS'}</div>
                  <div class="seal-date">${coveredEntries.length} ${isPt ? 'aparelhos' : 'items'}</div>
                </div>
              `
          }
        </div>

        ${
          singleWarrantyEntry && singleWarrantyEntry.warranty.expiryDate
            ? `
              <div class="warranty-dates">
                <div class="w-date-cell">
                  <span class="w-date-label">${isPt ? 'Data da Entrega' : 'Delivery Date'}</span>
                  <span class="w-date-val">${escapeHtml(formatFullDate(singleWarrantyEntry.warranty.deliveredDate, locale))}</span>
                </div>
                <div class="w-date-cell">
                  <span class="w-date-label">${isPt ? 'Prazo de Cobertura' : 'Coverage Period'}</span>
                  <span class="w-date-val">${singleWarrantyEntry.warranty.warrantyDays} ${isPt ? 'dias' : 'days'}</span>
                </div>
                <div class="w-date-cell highlight">
                  <span class="w-date-label">${isPt ? 'Término da Garantia' : 'Expiration Date'}</span>
                  <span class="w-date-val">${escapeHtml(formatFullDate(singleWarrantyEntry.warranty.expiryDate, locale))}</span>
                </div>
              </div>
            `
            : `
              <div class="warranty-list">
                ${coveredEntries
                  .map(
                    ({ item, warranty }) => `
                      <div class="w-list-row">
                        <span><strong>#${escapeHtml(item.tag)}</strong> ${escapeHtml([item.applianceType, item.brand].filter(Boolean).join(' '))}</span>
                        <span>${warranty.warrantyDays}d · ${isPt ? 'válida até' : 'valid until'} <strong>${escapeHtml(
                          warranty.expiryDate ? formatFullDate(warranty.expiryDate, locale) : '—'
                        )}</strong></span>
                      </div>
                    `
                  )
                  .join('')}
              </div>
            `
        }

        ${
          settings?.warrantyTerms?.trim()
            ? `<div class="warranty-custom">${escapeHtml(settings.warrantyTerms.trim())}</div>`
            : `<ol class="warranty-terms">
          ${
            isPt
              ? `
                <li>A garantia cobre exclusivamente o defeito diagnosticado, o serviço técnico executado e as peças substituídas nos aparelhos listados nesta Ordem de Serviço (<strong>OS #${order.orderNumber}</strong>).</li>
                <li>Não estão cobertos danos decorrentes de queda, umidade/líquidos, oscilação ou descarga elétrica, ligação em voltagem incorreta, mau uso ou abertura/intervenção do aparelho por terceiros.</li>
                <li>Para acionar a garantia dentro do prazo, apresente este comprovante ou informe o número da <strong>OS #${order.orderNumber}</strong> no balcão ou pelo WhatsApp da oficina.</li>
              `
              : `
                <li>Warranty covers exclusively the diagnosed issue, performed repair service, and parts replaced for the appliances listed under <strong>Order #${order.orderNumber}</strong>.</li>
                <li>Excludes physical impact, liquid exposure, power surges, incorrect voltage connection, misuse, or tampering by unauthorized third parties.</li>
                <li>To claim warranty within the coverage period, present this certificate or reference <strong>Order #${order.orderNumber}</strong>.</li>
              `
          }
        </ol>`
        }
      </section>
    `
      : `
      <section class="warranty-box neutral">
        <div class="warranty-top">
          <div>
            <div class="warranty-tag neutral">${
              isPt ? 'COMPROVANTE DE DEVOLUÇÃO' : 'RETURN RECEIPT'
            }</div>
            <div class="warranty-heading">${
              isPt ? 'Entrega sem cobrança' : 'Zero-charge return'
            }</div>
          </div>
        </div>
        <p class="neutral-note">
          ${
            isPt
              ? `Confirmamos a devolução dos aparelhos listados ao cliente em <strong>${escapeHtml(
                  formatDateTime(latestDeliveryDate, locale)
                )}</strong>, sem cobrança e sem cobertura de garantia de reparo.`
              : `Appliances returned to customer on <strong>${escapeHtml(
                  formatDateTime(latestDeliveryDate, locale)
                )}</strong> without charge and without repair warranty coverage.`
          }
        </p>
      </section>
    `;

  const signedEntry = [...warrantyEntries]
    .filter((entry) => Boolean(toSignatureDataUri(entry.item.deliverySignatureSvg)))
    .sort((a, b) => b.warranty.deliveredDate.getTime() - a.warranty.deliveredDate.getTime())[0];
  const customerSignatureDataUri = signedEntry
    ? toSignatureDataUri(signedEntry.item.deliverySignatureSvg)
    : '';
  const customerSignerDisplayName =
    signedEntry?.item.deliverySignerName ||
    sortedDelivered.find((i) => i.deliverySignerName)?.deliverySignerName ||
    order.customerName ||
    (isPt ? 'Cliente' : 'Customer');

  return `<!DOCTYPE html>
<html lang="${isPt ? 'pt-BR' : 'en'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(docTitle)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 13mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #FFFFFF;
      color: #0F172A;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.45;
    }
    .sheet {
      max-width: 760px;
      margin: 0 auto;
      padding: 2px;
    }
    .banner {
      background: #0F172A;
      color: #FFFFFF;
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      border-bottom: 4px solid #2563EB;
      margin-bottom: 14px;
    }
    .shop-eyebrow {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1.2px;
      color: #93C5FD;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .shop-name {
      font-size: 19px;
      font-weight: 800;
      margin: 0 0 5px 0;
      color: #FFFFFF;
      letter-spacing: -0.3px;
    }
    .shop-meta {
      font-size: 11px;
      color: #CBD5E1;
      margin: 2px 0;
    }
    .doc-box {
      text-align: right;
      flex-shrink: 0;
    }
    .doc-badge {
      display: inline-block;
      background: #2563EB;
      color: #FFFFFF;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 14px;
      font-weight: 800;
      padding: 6px 13px;
      border-radius: 7px;
      letter-spacing: 0.3px;
    }
    .doc-sub {
      font-size: 10.5px;
      color: #CBD5E1;
      margin-top: 6px;
    }
    .customer-bar {
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 14px;
    }
    .panel-head {
      background: #F1F5F9;
      border-bottom: 1px solid #E2E8F0;
      padding: 7px 12px;
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.8px;
      color: #475569;
      text-transform: uppercase;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .customer-grid {
      display: flex;
      gap: 16px;
      padding: 10px 12px;
      background: #FFFFFF;
    }
    .c-cell {
      flex: 1;
    }
    .c-label {
      display: block;
      font-size: 9.5px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .c-val {
      display: block;
      margin-top: 2px;
      font-size: 12.5px;
      font-weight: 700;
      color: #0F172A;
    }

    /* Consolidated Items Panel */
    .items-panel {
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 14px;
    }
    .item-block {
      padding: 11px 12px;
      border-bottom: 1px solid #E2E8F0;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .item-block:last-child {
      border-bottom: none;
    }
    .item-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }
    .item-head-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .item-tag {
      background: #0F172A;
      color: #FFFFFF;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 10.5px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 5px;
      flex-shrink: 0;
    }
    .item-title {
      font-size: 13.5px;
      font-weight: 800;
      color: #0F172A;
    }
    .item-head-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .item-warranty-badge {
      background: #EFF6FF;
      border: 1px solid #BFDBFE;
      color: #1E40AF;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 999px;
    }
    .item-warranty-badge.neutral {
      background: #F1F5F9;
      border-color: #CBD5E1;
      color: #475569;
    }
    .item-price {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      font-weight: 800;
      color: #0F172A;
    }
    .item-meta-line {
      font-size: 10.5px;
      color: #64748B;
      margin-bottom: 8px;
    }
    .item-report-grid {
      display: flex;
      border: 1px solid #E2E8F0;
      border-radius: 7px;
      overflow: hidden;
      background: #F8FAFC;
    }
    .item-report-col {
      flex: 1;
      padding: 7px 10px;
    }
    .item-report-col + .item-report-col {
      border-left: 1px solid #E2E8F0;
      background: #FFFFFF;
    }
    .report-sub {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.6px;
      color: #64748B;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .report-text {
      margin: 0;
      color: #1E293B;
      font-size: 11.5px;
      white-space: pre-wrap;
    }
    .pending-note {
      background: #FFFBEB;
      border-top: 1px solid #FDE68A;
      color: #92400E;
      font-size: 10.5px;
      padding: 8px 12px;
    }

    /* Financial Table */
    .finance-panel {
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 14px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    table.fin-table {
      width: 100%;
      border-collapse: collapse;
    }
    table.fin-table td {
      padding: 7px 12px;
      border-bottom: 1px solid #F1F5F9;
      font-size: 12px;
    }
    table.fin-table td.num {
      text-align: right;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-weight: 600;
    }
    table.fin-table tr.discount td {
      color: #059669;
    }
    table.fin-table tr.total-row td {
      background: #F8FAFC;
      border-top: 2px solid #0F172A;
      border-bottom: none;
      font-size: 14px;
      font-weight: 800;
      color: #0F172A;
      padding: 9px 12px;
    }
    .payments-strip {
      padding: 9px 12px;
      border-top: 1px dashed #CBD5E1;
      background: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pay-strip-label {
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.7px;
      color: #64748B;
      text-transform: uppercase;
    }
    .pay-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .pay-pill {
      display: inline-block;
      background: #ECFDF5;
      border: 1px solid #A7F3D0;
      color: #065F46;
      font-size: 11px;
      padding: 3px 9px;
      border-radius: 999px;
    }
    .pay-pill.neutral {
      background: #F1F5F9;
      border-color: #CBD5E1;
      color: #334155;
    }

    /* Warranty Certificate */
    .warranty-box {
      border: 1.5px solid #93C5FD;
      background: #EFF6FF;
      border-radius: 10px;
      padding: 13px 15px;
      margin-bottom: 16px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .warranty-box.neutral {
      border-color: #CBD5E1;
      background: #F8FAFC;
    }
    .warranty-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }
    .warranty-tag {
      display: inline-block;
      background: #2563EB;
      color: #FFFFFF;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.8px;
      padding: 3px 8px;
      border-radius: 4px;
      margin-bottom: 4px;
    }
    .warranty-tag.neutral {
      background: #475569;
    }
    .warranty-heading {
      font-size: 14px;
      font-weight: 800;
      color: #0F172A;
    }
    .warranty-seal {
      background: #FFFFFF;
      border: 1.5px solid #2563EB;
      border-radius: 8px;
      padding: 5px 12px;
      text-align: center;
    }
    .seal-label {
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 0.7px;
      color: #2563EB;
    }
    .seal-date {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13.5px;
      font-weight: 800;
      color: #1E3A8A;
    }
    .warranty-dates {
      display: flex;
      gap: 8px;
      margin-bottom: 9px;
    }
    .w-date-cell {
      flex: 1;
      background: #FFFFFF;
      border: 1px solid #DBEAFE;
      border-radius: 7px;
      padding: 6px 9px;
    }
    .w-date-cell.highlight {
      border-color: #93C5FD;
      background: #DBEAFE;
    }
    .w-date-label {
      display: block;
      font-size: 9px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .w-date-val {
      display: block;
      margin-top: 2px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      font-weight: 700;
      color: #0F172A;
    }
    .warranty-list {
      background: #FFFFFF;
      border: 1px solid #DBEAFE;
      border-radius: 7px;
      padding: 6px 10px;
      margin-bottom: 9px;
    }
    .w-list-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 3px 0;
      font-size: 11px;
      border-bottom: 1px solid #F1F5F9;
    }
    .w-list-row:last-child {
      border-bottom: none;
    }
    .warranty-terms {
      margin: 0;
      padding-left: 18px;
      color: #1E293B;
      font-size: 10.5px;
    }
    .warranty-terms li {
      margin-bottom: 4px;
    }
    .warranty-custom {
      color: #1E293B;
      font-size: 10.5px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .banner-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .banner-logo {
      width: 48px;
      height: 48px;
      border-radius: 9px;
      object-fit: contain;
      background: #FFFFFF;
      padding: 3px;
      flex-shrink: 0;
    }
    .neutral-note {
      margin: 4px 0 0 0;
      font-size: 11.5px;
      color: #334155;
    }
    .signatures {
      display: flex;
      gap: 32px;
      margin-top: 24px;
      margin-bottom: 14px;
      padding: 0 12px;
      align-items: flex-end;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sig-col {
      flex: 1;
      text-align: center;
    }
    .sig-img-wrap {
      height: 62px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding-bottom: 4px;
    }
    .sig-img {
      max-width: 100%;
      max-height: 58px;
      object-fit: contain;
    }
    .sig-line {
      border-top: 1px solid #64748B;
      padding-top: 6px;
      font-size: 11px;
      font-weight: 600;
      color: #475569;
    }
    .sig-role {
      font-size: 9.5px;
      color: #94A3B8;
      margin-top: 2px;
    }
    .footer {
      border-top: 1px solid #E2E8F0;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9.5px;
      color: #64748B;
    }
    .footer-brand {
      font-weight: 700;
      color: #0F172A;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="banner">
      <div class="banner-brand">
        ${
          sanitizeRasterDataUrl(settings?.shopLogoDataUrl)
            ? `<img class="banner-logo" src="${sanitizeRasterDataUrl(settings?.shopLogoDataUrl)}" alt="Logo" />`
            : ''
        }
        <div>
          <div class="shop-eyebrow">${isPt ? 'COMPROVANTE DE ENTREGA & GARANTIA' : 'DELIVERY RECEIPT & WARRANTY'}</div>
          <h1 class="shop-name">${escapeHtml(tenant.name)}</h1>
          ${docFormatted ? `<p class="shop-meta">${isPt ? 'CNPJ/CPF' : 'Tax ID'}: ${escapeHtml(docFormatted)}</p>` : ''}
          <p class="shop-meta">${isPt ? 'Telefone / WhatsApp' : 'Phone / WhatsApp'}: ${escapeHtml(formatPhoneDisplay(tenant.phone))}</p>
          ${settings?.shopAddress ? `<p class="shop-meta">${escapeHtml(settings.shopAddress)}</p>` : ''}
          ${settings?.businessHours ? `<p class="shop-meta">${isPt ? 'Horário' : 'Hours'}: ${escapeHtml(settings.businessHours)}</p>` : ''}
        </div>
      </div>
      <div class="doc-box">
        <div class="doc-badge">OS #${order.orderNumber}</div>
        <div class="doc-sub">${escapeHtml(itemCountBadge)}</div>
        <div class="doc-sub">${escapeHtml(formatDateTime(latestDeliveryDate, locale))}</div>
      </div>
    </header>

    <section class="customer-bar">
      <div class="panel-head">
        <span>${isPt ? 'Dados do Cliente e da Nota' : 'Customer & Order Info'}</span>
        <span>${isPt ? 'Abertura' : 'Opened'}: ${escapeHtml(formatFullDate(new Date(order.createdAt), locale))}</span>
      </div>
      <div class="customer-grid">
        <div class="c-cell">
          <span class="c-label">${isPt ? 'Cliente' : 'Customer'}</span>
          <span class="c-val">${escapeHtml(order.customerName ?? '—')}</span>
        </div>
        <div class="c-cell">
          <span class="c-label">${isPt ? 'Telefone / WhatsApp' : 'Phone / WhatsApp'}</span>
          <span class="c-val">${escapeHtml(formatPhoneDisplay(order.customerPhone))}</span>
        </div>
        <div class="c-cell">
          <span class="c-label">${isPt ? 'Ordem de Serviço' : 'Service Order'}</span>
          <span class="c-val">OS #${order.orderNumber}</span>
        </div>
      </div>
    </section>

    <section class="items-panel">
      <div class="panel-head">
        <span>${isPt ? 'Equipamentos Entregues' : 'Delivered Appliances'}</span>
        <span>${escapeHtml(itemCountBadge)}</span>
      </div>
      ${itemsCardsHtml}
      ${pendingItemsNoteHtml}
    </section>

    <section class="finance-panel">
      <div class="panel-head">${isPt ? 'Resumo Financeiro Consolidado' : 'Consolidated Payment Summary'}</div>
      <table class="fin-table">
        <tbody>
          ${
            !isAllFreeReturn
              ? `
                <tr>
                  <td>${isPt ? 'Mão de obra técnica' : 'Technical labor'}</td>
                  <td class="num">${escapeHtml(formatMoney(totalLabor, locale))}</td>
                </tr>
                <tr>
                  <td>${isPt ? 'Peças e componentes' : 'Parts & components'}</td>
                  <td class="num">${escapeHtml(formatMoney(totalParts, locale))}</td>
                </tr>
                ${
                  totalDiscount > 0
                    ? `<tr class="discount"><td>${isPt ? 'Desconto concedido' : 'Discount'}</td><td class="num">- ${escapeHtml(formatMoney(totalDiscount, locale))}</td></tr>`
                    : ''
                }
              `
              : ''
          }
          <tr class="total-row">
            <td>${isPt ? 'TOTAL PAGO NA NOTA' : 'ORDER TOTAL PAID'}</td>
            <td class="num">${escapeHtml(formatMoney(grandTotal, locale))}</td>
          </tr>
        </tbody>
      </table>
      <div class="payments-strip">
        <span class="pay-strip-label">${isPt ? 'Formas de Pagamento' : 'Payment Methods'}</span>
        <div class="pay-pills">${paymentPillsHtml}</div>
      </div>
    </section>

    ${warrantySectionHtml}

    <div class="signatures">
      <div class="sig-col">
        ${customerSignatureDataUri ? '<div class="sig-img-wrap"></div>' : ''}
        <div class="sig-line">${escapeHtml(tenant.name)}</div>
        <div class="sig-role">${isPt ? 'Responsável Técnico / Oficina' : 'Workshop Representative'}</div>
      </div>
      <div class="sig-col">
        ${
          customerSignatureDataUri
            ? `<div class="sig-img-wrap"><img class="sig-img" src="${customerSignatureDataUri}" alt="Assinatura digital" /></div>`
            : ''
        }
        <div class="sig-line">${escapeHtml(customerSignerDisplayName)}</div>
        <div class="sig-role">${
          customerSignatureDataUri && signedEntry
            ? isPt
              ? `Assinado digitalmente na retirada · ${escapeHtml(formatDateTime(signedEntry.warranty.deliveredDate, locale))}`
              : `Digitally signed at pickup · ${escapeHtml(formatDateTime(signedEntry.warranty.deliveredDate, locale))}`
            : isPt
              ? 'Recebi os aparelhos em perfeitas condições'
              : 'Customer Signature'
        }</div>
      </div>
    </div>

    <footer class="footer">
      <span>${isPt ? 'Acompanhamento online' : 'Online tracking'}: ${escapeHtml(trackingUrl)}</span>
      <span class="footer-brand">BenchOS</span>
    </footer>
  </div>
</body>
</html>`;
}

function printHtmlInWebIframe(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Document unavailable for web printing'));
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 500);
    };

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) {
          cleanup();
          reject(new Error('Could not open print frame'));
          return;
        }
        win.onafterprint = () => {
          cleanup();
        };
        win.focus();
        win.print();
        setTimeout(cleanup, 30_000);
        resolve();
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    document.body.appendChild(iframe);
    const frameDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!frameDoc) {
      cleanup();
      reject(new Error('Could not access print document'));
      return;
    }
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();
  });
}

async function renderAndSharePdf(html: string, filename: string, dialogTitle: string): Promise<void> {
  if (Platform.OS === 'web') {
    await printHtmlInWebIframe(html);
    return;
  }

  const { uri, base64 } = await Print.printToFileAsync({
    html,
    base64: true,
  });

  const targetFile = new File(Paths.cache, filename);
  let shareUri = uri;

  if (base64) {
    // Write PDF bytes directly inside the experience-scoped `Paths.cache` directory so
    // `SharingModule` / `FileProvider` is always authorized to read it (both in Expo Go
    // and standalone APK builds) with a clean filename.
    await targetFile.write(base64, { encoding: 'base64' });
    shareUri = targetFile.uri;
  } else {
    try {
      const generatedFile = new File(uri);
      await generatedFile.copy(targetFile, { overwrite: true });
      if (targetFile.exists && targetFile.size > 0) {
        shareUri = targetFile.uri;
      }
    } catch {
      shareUri = uri;
    }
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    await Print.printAsync({ uri: shareUri });
    return;
  }

  await Sharing.shareAsync(shareUri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle,
  });
}

/**
 * Generates and shares a single consolidated Delivery Receipt & Warranty PDF
 * containing ALL delivered appliances of the given Service Order.
 */
export async function shareConsolidatedOrderReceiptPdf({
  tenant,
  settings,
  order,
  locale,
  overrideItem,
  overrideItemPayments,
}: ShareOrderWarrantyReceiptParams): Promise<void> {
  const resolvedSettings =
    settings !== undefined ? settings : await tenantSettingsApi.get().catch(() => null);
  const mergedItems = overrideItem
    ? order.items.map((existing) => (existing.id === overrideItem.id ? overrideItem : existing))
    : order.items;

  const mergedOrder: ServiceOrderResponse = {
    ...order,
    items: mergedItems,
  };

  const deliveredItems = mergedItems.filter((item) => item.status === 'DELIVERED');
  if (deliveredItems.length === 0) {
    throw new Error(
      locale === 'pt-BR'
        ? 'Nenhum aparelho entregue nesta OS para gerar comprovante.'
        : 'No delivered appliances in this order to generate a receipt.'
    );
  }

  const paymentArrays = await Promise.all(
    deliveredItems.map(async (item): Promise<ReceiptPaymentPart[]> => {
      if (overrideItem && item.id === overrideItem.id && overrideItemPayments) {
        return overrideItemPayments;
      }
      if (Number(item.totalPrice) <= 0) {
        return [];
      }
      try {
        const fetched = await financeApi.listItemPayments(item.id);
        return fetched.map((p) => ({
          paymentMethod: p.paymentMethod,
          amount: Number(p.amount) || 0,
        }));
      } catch {
        return [];
      }
    })
  );

  const allPayments = paymentArrays.flat();
  const html = buildOrderWarrantyReceiptHtml({
    tenant,
    settings: resolvedSettings,
    order: mergedOrder,
    deliveredItems,
    payments: allPayments,
    locale,
  });

  const filename = `comprovante-garantia-os-${order.orderNumber}.pdf`;
  const dialogTitle =
    locale === 'pt-BR'
      ? `Comprovante e Garantia — OS #${order.orderNumber}`
      : `Warranty Receipt — Order #${order.orderNumber}`;

  await renderAndSharePdf(html, filename, dialogTitle);
}

export function formatWhatsappPhoneDigits(rawPhone: string | null | undefined): string {
  const digits = String(rawPhone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
}

export function getPublicOrderReceiptUrl(publicToken: string): string {
  return `${API_BASE_URL}/track/${publicToken}/receipt`;
}

export interface SendOrderReceiptWhatsappParams {
  tenant: TenantResponse;
  order: ServiceOrderResponse;
  locale: Locale;
  overrideItem?: ServiceOrderItemResponse;
}

export function buildOrderReceiptWhatsappMessage({
  tenant,
  order,
  locale,
  overrideItem,
}: SendOrderReceiptWhatsappParams): string {
  const isPt = locale === 'pt-BR';
  const mergedItems = overrideItem
    ? order.items.map((existing) => (existing.id === overrideItem.id ? overrideItem : existing))
    : order.items;

  const deliveredItems = mergedItems
    .filter((item) => item.status === 'DELIVERED')
    .sort((a, b) => a.itemIndex - b.itemIndex);

  if (deliveredItems.length === 0) {
    throw new Error(
      isPt
        ? 'Nenhum aparelho entregue nesta OS para enviar comprovante.'
        : 'No delivered appliances in this order to send a receipt.'
    );
  }

  const grandTotal = deliveredItems.reduce((acc, item) => acc + (Number(item.totalPrice) || 0), 0);
  const receiptUrl = getPublicOrderReceiptUrl(order.publicToken);
  const customerFirstName = (order.customerName ?? '').trim().split(/\s+/)[0];

  const lines: string[] = [];

  if (isPt) {
    lines.push(
      customerFirstName
        ? `Olá, *${customerFirstName}*! Segue o comprovante de entrega e termo de garantia da sua *OS #${order.orderNumber}* (${tenant.name}):`
        : `Olá! Segue o comprovante de entrega e termo de garantia da sua *OS #${order.orderNumber}* (${tenant.name}):`
    );
    lines.push('');

    for (const item of deliveredItems) {
      const title = [item.applianceType, item.brand, item.model].filter(Boolean).join(' ');
      const warranty = computeWarrantyInfo(item);
      const priceText = Number(item.totalPrice) > 0 ? formatMoney(Number(item.totalPrice), locale) : 'Sem cobrança';
      const warrantyText =
        warranty.hasWarranty && warranty.expiryDate
          ? `Garantia ${warranty.warrantyDays}d (até ${formatFullDate(warranty.expiryDate, locale)})`
          : 'Devolução sem garantia';

      lines.push(`• *#${item.tag} ${title}* — ${priceText}`);
      lines.push(`  _${warrantyText}_`);
    }

    lines.push('');
    lines.push(
      grandTotal > 0
        ? `*Total pago:* ${formatMoney(grandTotal, locale)}`
        : '*Situação:* Devolução sem cobrança'
    );
    lines.push('');
    lines.push('📄 *Abrir comprovante completo / baixar PDF:*');
    lines.push(receiptUrl);
    lines.push('');
    lines.push('Qualquer dúvida, estamos à disposição!');
  } else {
    lines.push(
      customerFirstName
        ? `Hello *${customerFirstName}*! Here is your delivery receipt & warranty certificate for *Order #${order.orderNumber}* (${tenant.name}):`
        : `Hello! Here is your delivery receipt & warranty certificate for *Order #${order.orderNumber}* (${tenant.name}):`
    );
    lines.push('');

    for (const item of deliveredItems) {
      const title = [item.applianceType, item.brand, item.model].filter(Boolean).join(' ');
      const warranty = computeWarrantyInfo(item);
      const priceText = Number(item.totalPrice) > 0 ? formatMoney(Number(item.totalPrice), locale) : 'No charge';
      const warrantyText =
        warranty.hasWarranty && warranty.expiryDate
          ? `${warranty.warrantyDays}d warranty (until ${formatFullDate(warranty.expiryDate, locale)})`
          : 'No warranty coverage';

      lines.push(`• *#${item.tag} ${title}* — ${priceText}`);
      lines.push(`  _${warrantyText}_`);
    }

    lines.push('');
    lines.push(
      grandTotal > 0
        ? `*Total paid:* ${formatMoney(grandTotal, locale)}`
        : '*Status:* Zero-charge return'
    );
    lines.push('');
    lines.push('📄 *View full receipt / download PDF:*');
    lines.push(receiptUrl);
  }

  return lines.join('\n');
}

/**
 * Opens WhatsApp directly in the customer's chat with a consolidated delivery receipt
 * message + clickable public receipt/PDF link (zero manual contact searching).
 */
export async function sendConsolidatedOrderReceiptWhatsapp(
  params: SendOrderReceiptWhatsappParams
): Promise<void> {
  const digits = formatWhatsappPhoneDigits(params.order.customerPhone);
  if (!digits) {
    throw new Error(
      params.locale === 'pt-BR'
        ? 'Este cliente não possui telefone/WhatsApp cadastrado.'
        : 'This customer does not have a phone/WhatsApp number on file.'
    );
  }

  const message = buildOrderReceiptWhatsappMessage(params);
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  await Linking.openURL(url);
}
