import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { API_BASE_URL } from '@/api/http';
import type { Locale } from '@/i18n/translations';
import type {
  OrderPaymentMethod,
  ServiceOrderItemResponse,
  ServiceOrderResponse,
  TenantResponse,
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

export interface GenerateWarrantyReceiptParams {
  tenant: TenantResponse;
  order: ServiceOrderResponse;
  item: ServiceOrderItemResponse;
  payments: ReceiptPaymentPart[];
  locale: Locale;
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

export function buildWarrantyReceiptHtml({
  tenant,
  order,
  item,
  payments,
  locale,
}: GenerateWarrantyReceiptParams): string {
  const isPt = locale === 'pt-BR';
  const warranty = computeWarrantyInfo(item);
  const applianceTitle = [item.applianceType, item.brand, item.model].filter(Boolean).join(' ');
  const isFreeReturn = Number(item.totalPrice) <= 0;
  const trackingUrl = `${API_BASE_URL}/track/${order.publicToken}`;
  const docFormatted = formatDocumentDisplay(tenant.document);

  const paymentRowsHtml = isFreeReturn
    ? `<div class="pay-row"><span>${isPt ? 'Modalidade' : 'Type'}</span><strong>${
        isPt ? 'Devolução sem cobrança' : 'Zero-charge return'
      }</strong></div>`
    : payments.length > 0
      ? payments
          .map(
            (p) =>
              `<div class="pay-row"><span>${escapeHtml(
                formatPaymentMethodLabel(p.paymentMethod, locale)
              )}</span><strong>${escapeHtml(formatMoney(p.amount, locale))}</strong></div>`
          )
          .join('')
      : `<div class="pay-row"><span>${isPt ? 'Pagamento' : 'Payment'}</span><strong>${
          isPt ? 'Quitado na entrega' : 'Paid upon delivery'
        }</strong></div>`;

  const warrantySectionHtml = warranty.hasWarranty && warranty.expiryDate
    ? `
      <div class="warranty-box">
        <div class="warranty-header">
          <div class="warranty-badge">${isPt ? 'TERMO DE GARANTIA' : 'WARRANTY CERTIFICATE'}</div>
          <div class="warranty-until">
            ${isPt ? 'Válida até' : 'Valid until'} <strong>${escapeHtml(
              formatFullDate(warranty.expiryDate, locale)
            )}</strong>
          </div>
        </div>
        <p class="warranty-summary">
          ${
            isPt
              ? `Este reparo conta com garantia de <strong>${warranty.warrantyDays} dias</strong> a partir da data de entrega (<strong>${escapeHtml(
                  formatFullDate(warranty.deliveredDate, locale)
                )}</strong>), encerrando-se em <strong>${escapeHtml(
                  formatFullDate(warranty.expiryDate, locale)
                )}</strong>.`
              : `This repair is covered by a <strong>${warranty.warrantyDays}-day warranty</strong> from delivery date (<strong>${escapeHtml(
                  formatFullDate(warranty.deliveredDate, locale)
                )}</strong>), expiring on <strong>${escapeHtml(
                  formatFullDate(warranty.expiryDate, locale)
                )}</strong>.`
          }
        </p>
        <ul class="warranty-terms">
          ${
            isPt
              ? `
                <li>A garantia cobre exclusivamente o defeito diagnosticado, o serviço executado e as peças substituídas nesta Ordem de Serviço.</li>
                <li>A garantia não cobre danos causados por queda, umidade, variação ou descarga elétrica, ligação em voltagem incorreta, mau uso ou violação do aparelho por terceiros.</li>
                <li>Para acionamento da garantia, apresente este comprovante ou informe a etiqueta <strong>#${escapeHtml(item.tag)}</strong>.</li>
              `
              : `
                <li>Warranty covers solely the diagnosed issue, performed service, and parts replaced under this Service Order.</li>
                <li>Warranty excludes physical damage, liquid exposure, electrical surges, improper voltage connection, misuse, or tampering by third parties.</li>
                <li>To request warranty service, present this receipt or reference tag <strong>#${escapeHtml(item.tag)}</strong>.</li>
              `
          }
        </ul>
      </div>
    `
    : `
      <div class="warranty-box neutral">
        <div class="warranty-header">
          <div class="warranty-badge neutral">${
            isPt ? 'COMPROVANTE DE DEVOLUÇÃO' : 'RETURN RECEIPT'
          }</div>
        </div>
        <p class="warranty-summary">
          ${
            isPt
              ? `Aparelho entregue ao cliente em <strong>${escapeHtml(
                  formatDateTime(warranty.deliveredDate, locale)
                )}</strong> sem cobrança e sem cobertura de garantia de reparo.`
              : `Appliance returned to customer on <strong>${escapeHtml(
                  formatDateTime(warranty.deliveredDate, locale)
                )}</strong> without charge and without repair warranty coverage.`
          }
        </p>
      </div>
    `;

  return `<!DOCTYPE html>
<html lang="${isPt ? 'pt-BR' : 'en'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    @page { margin: 24px; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      margin: 0;
      padding: 0;
      font-size: 13px;
      line-height: 1.45;
      background: #FFFFFF;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0F172A;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .shop-name {
      font-size: 20px;
      font-weight: 800;
      color: #0F172A;
      margin: 0 0 4px 0;
    }
    .shop-meta {
      font-size: 12px;
      color: #475569;
      margin: 2px 0;
    }
    .doc-pill {
      text-align: right;
    }
    .doc-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.8px;
      color: #2563EB;
      text-transform: uppercase;
    }
    .os-tag {
      display: inline-block;
      margin-top: 6px;
      background: #0F172A;
      color: #FFFFFF;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
    }
    .delivery-date {
      font-size: 11px;
      color: #64748B;
      margin-top: 6px;
    }
    .grid {
      display: flex;
      gap: 14px;
      margin-bottom: 16px;
    }
    .card {
      flex: 1;
      border: 1px solid #E2E8F0;
      border-radius: 10px;
      padding: 12px 14px;
      background: #F8FAFC;
    }
    .section-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.7px;
      color: #64748B;
      text-transform: uppercase;
      margin: 0 0 6px 0;
    }
    .value-strong {
      font-size: 14px;
      font-weight: 700;
      color: #0F172A;
      margin: 0 0 4px 0;
    }
    .value-muted {
      font-size: 12px;
      color: #475569;
      margin: 2px 0;
    }
    .service-box {
      border: 1px solid #E2E8F0;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 16px;
    }
    .service-text {
      margin: 4px 0 0 0;
      color: #1E293B;
      white-space: pre-wrap;
    }
    .service-divider {
      height: 1px;
      background: #E2E8F0;
      margin: 10px 0;
    }
    .finance-box {
      border: 1px solid #E2E8F0;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 16px;
    }
    .price-row, .pay-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 12.5px;
      color: #334155;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-top: 2px solid #0F172A;
      margin-top: 8px;
      padding-top: 8px;
      font-size: 15px;
      font-weight: 800;
      color: #0F172A;
    }
    .payments-sub {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px dashed #CBD5E1;
    }
    .warranty-box {
      border: 1.5px solid #93C5FD;
      background: #EFF6FF;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 18px;
    }
    .warranty-box.neutral {
      border-color: #CBD5E1;
      background: #F8FAFC;
    }
    .warranty-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .warranty-badge {
      background: #2563EB;
      color: #FFFFFF;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.7px;
      padding: 3px 8px;
      border-radius: 4px;
    }
    .warranty-badge.neutral {
      background: #475569;
    }
    .warranty-until {
      font-size: 13px;
      color: #1E40AF;
    }
    .warranty-summary {
      margin: 0 0 8px 0;
      color: #1E293B;
      font-size: 12.5px;
    }
    .warranty-terms {
      margin: 0;
      padding-left: 18px;
      color: #334155;
      font-size: 11.5px;
    }
    .warranty-terms li {
      margin-bottom: 4px;
    }
    .signatures {
      display: flex;
      gap: 28px;
      margin-top: 26px;
      margin-bottom: 18px;
    }
    .sig-col {
      flex: 1;
      text-align: center;
    }
    .sig-line {
      border-top: 1px solid #94A3B8;
      padding-top: 6px;
      font-size: 11px;
      color: #64748B;
    }
    .footer {
      border-top: 1px solid #E2E8F0;
      padding-top: 10px;
      display: flex;
      justify-content: space-between;
      font-size: 10.5px;
      color: #64748B;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="shop-name">${escapeHtml(tenant.name)}</h1>
      ${docFormatted ? `<p class="shop-meta">${isPt ? 'CNPJ/CPF' : 'Tax ID'}: ${escapeHtml(docFormatted)}</p>` : ''}
      <p class="shop-meta">${isPt ? 'Telefone / WhatsApp' : 'Phone / WhatsApp'}: ${escapeHtml(formatPhoneDisplay(tenant.phone))}</p>
    </div>
    <div class="doc-pill">
      <div class="doc-title">${isPt ? 'COMPROVANTE DE ENTREGA' : 'DELIVERY RECEIPT'}</div>
      <div class="os-tag">OS #${order.orderNumber} · #${escapeHtml(item.tag)}</div>
      <div class="delivery-date">${isPt ? 'Entregue em' : 'Delivered on'} ${escapeHtml(formatDateTime(warranty.deliveredDate, locale))}</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="section-label">${isPt ? 'CLIENTE' : 'CUSTOMER'}</div>
      <div class="value-strong">${escapeHtml(order.customerName ?? '—')}</div>
      <div class="value-muted">${escapeHtml(formatPhoneDisplay(order.customerPhone))}</div>
    </div>
    <div class="card">
      <div class="section-label">${isPt ? 'APARELHO' : 'APPLIANCE'}</div>
      <div class="value-strong">${escapeHtml(applianceTitle)}</div>
      <div class="value-muted">
        ${isPt ? 'Voltagem' : 'Voltage'}: ${escapeHtml(formatVoltageLabel(item.voltage))}
        ${item.serialNumber ? ` · S/N: ${escapeHtml(item.serialNumber)}` : ''}
      </div>
      ${
        item.accessories
          ? `<div class="value-muted">${isPt ? 'Acessórios' : 'Accessories'}: ${escapeHtml(item.accessories)}</div>`
          : ''
      }
    </div>
  </div>

  <div class="service-box">
    <div class="section-label">${isPt ? 'DEFEITO RELATADO NA ENTRADA' : 'REPORTED ISSUE'}</div>
    <p class="service-text">${escapeHtml(item.reportedIssue)}</p>
    <div class="service-divider"></div>
    <div class="section-label">${isPt ? 'SERVIÇO / DIAGNÓSTICO EXECUTADO' : 'PERFORMED SERVICE / DIAGNOSIS'}</div>
    <p class="service-text">${escapeHtml(
      item.technicalDiagnosis ||
        (isPt ? 'Serviço técnico concluído conforme orçamento aprovado.' : 'Technical service completed as approved.')
    )}</p>
  </div>

  <div class="finance-box">
    <div class="section-label">${isPt ? 'RESUMO FINANCEIRO E PAGAMENTO' : 'PAYMENT SUMMARY'}</div>
    ${
      !isFreeReturn
        ? `
          <div class="price-row"><span>${isPt ? 'Mão de obra' : 'Labor'}</span><span>${escapeHtml(formatMoney(item.laborCost, locale))}</span></div>
          <div class="price-row"><span>${isPt ? 'Peças' : 'Parts'}</span><span>${escapeHtml(formatMoney(item.partsCost, locale))}</span></div>
          ${
            Number(item.discount) > 0
              ? `<div class="price-row"><span>${isPt ? 'Desconto' : 'Discount'}</span><span>- ${escapeHtml(formatMoney(item.discount, locale))}</span></div>`
              : ''
          }
        `
        : ''
    }
    <div class="total-row">
      <span>${isPt ? 'TOTAL PAGO' : 'TOTAL PAID'}</span>
      <span>${escapeHtml(formatMoney(item.totalPrice, locale))}</span>
    </div>
    <div class="payments-sub">
      <div class="section-label">${isPt ? 'FORMAS DE PAGAMENTO' : 'PAYMENT METHODS'}</div>
      ${paymentRowsHtml}
    </div>
  </div>

  ${warrantySectionHtml}

  <div class="signatures">
    <div class="sig-col">
      <div class="sig-line">${escapeHtml(tenant.name)}</div>
    </div>
    <div class="sig-col">
      <div class="sig-line">${escapeHtml(order.customerName ?? (isPt ? 'Assinatura do Cliente' : 'Customer Signature'))}</div>
    </div>
  </div>

  <div class="footer">
    <span>${isPt ? 'Acompanhamento' : 'Tracking'}: ${escapeHtml(trackingUrl)}</span>
    <span>BenchOS</span>
  </div>
</body>
</html>`;
}

export async function generateAndShareWarrantyReceiptPdf(
  params: GenerateWarrantyReceiptParams
): Promise<void> {
  const html = buildWarrantyReceiptHtml(params);

  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html });

  let shareUri = uri;
  try {
    const safeTag = params.item.tag.replace(/[^A-Za-z0-9_-]/g, '-');
    const targetFile = new File(Paths.cache, `comprovante-garantia-os-${safeTag}.pdf`);
    if (targetFile.exists) {
      targetFile.delete();
    }
    const generatedFile = new File(uri);
    generatedFile.move(targetFile);
    shareUri = targetFile.uri;
  } catch {
    shareUri = uri;
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    await Print.printAsync({ uri: shareUri });
    return;
  }

  await Sharing.shareAsync(shareUri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle:
      params.locale === 'pt-BR'
        ? `Comprovante e Garantia — OS #${params.item.tag}`
        : `Warranty Receipt — Order #${params.item.tag}`,
  });
}
