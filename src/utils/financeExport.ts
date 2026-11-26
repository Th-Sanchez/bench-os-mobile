import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { financeApi } from '@/api/endpoints';
import type { Locale } from '@/i18n/translations';
import type {
  DailyCashClosingResponse,
  FinancialSummaryResponse,
  FinancialTransactionResponse,
  TenantResponse,
  TransactionCategory,
  TransactionPaymentMethod,
} from '@/types/api';
import { maskCpfCnpj, maskPhoneBR } from './masks';
import { formatTransactionDescription } from './transactionDescription';

const MONTH_FULL_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const MONTH_FULL_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const PAYMENT_LABELS_PT: Record<TransactionPaymentMethod, string> = {
  PIX: 'PIX',
  CASH: 'Dinheiro',
  DEBIT_CARD: 'Cartão Débito',
  CREDIT_CARD: 'Cartão Crédito',
  STORE_CREDIT: 'Fiado / Boleto',
};

const PAYMENT_LABELS_EN: Record<TransactionPaymentMethod, string> = {
  PIX: 'PIX',
  CASH: 'Cash',
  DEBIT_CARD: 'Debit Card',
  CREDIT_CARD: 'Credit Card',
  STORE_CREDIT: 'Store Credit',
};

const CATEGORY_LABELS_PT: Record<TransactionCategory, string> = {
  REPAIR_PAYMENT: 'Pagamento de OS',
  PARTS_PURCHASE: 'Compra de Peças',
  OPERATIONAL_EXPENSE: 'Despesa Operacional',
  OTHER: 'Outros',
};

const CATEGORY_LABELS_EN: Record<TransactionCategory, string> = {
  REPAIR_PAYMENT: 'Repair Payment',
  PARTS_PURCHASE: 'Parts Purchase',
  OPERATIONAL_EXPENSE: 'Operational Expense',
  OTHER: 'Other',
};

function escapeHtml(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeCsvCell(raw: string | number | null | undefined, delimiter: string): string {
  const str = String(raw ?? '');
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatMoney(value: number, locale: Locale): string {
  const num = Number(value) || 0;
  if (locale === 'en') {
    return `R$ ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCsvNumber(value: number, locale: Locale): string {
  const fixed = (Number(value) || 0).toFixed(2);
  return locale === 'pt-BR' ? fixed.replace('.', ',') : fixed;
}

function formatIsoDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return '—';
  const datePart = iso.slice(0, 10);
  const parts = datePart.split('-');
  if (parts.length !== 3) return datePart;
  return locale === 'en' ? datePart : `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatIsoTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getPaymentLabel(method: TransactionPaymentMethod, locale: Locale): string {
  return (locale === 'pt-BR' ? PAYMENT_LABELS_PT : PAYMENT_LABELS_EN)[method] ?? method;
}

function getCategoryLabel(category: TransactionCategory, locale: Locale): string {
  return (locale === 'pt-BR' ? CATEGORY_LABELS_PT : CATEGORY_LABELS_EN)[category] ?? category;
}

function slugifyMonth(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

/**
 * Fetches every transaction page in the selected month so monthly CSV/PDF exports
 * remain 100% complete even when a busy shop exceeds 100 entries in a single month.
 */
export async function fetchAllMonthlyTransactions(
  from: string,
  to: string
): Promise<FinancialTransactionResponse[]> {
  const all: FinancialTransactionResponse[] = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages && page < 20) {
    const res = await financeApi.listTransactions({ from, to, page, size: 100 });
    all.push(...res.content);
    totalPages = Math.max(1, res.totalPages);
    page += 1;
  }

  return all;
}

export interface MonthlyExportParams {
  tenant: TenantResponse;
  year: number;
  monthIndex: number;
  summary: FinancialSummaryResponse;
  transactions: FinancialTransactionResponse[];
  locale: Locale;
}

export function buildMonthlyFinanceCsv(params: MonthlyExportParams): string {
  const { tenant, year, monthIndex, summary, transactions, locale } = params;
  const isPt = locale === 'pt-BR';
  const sep = isPt ? ';' : ',';
  const monthName = (isPt ? MONTH_FULL_PT : MONTH_FULL_EN)[monthIndex];

  const headers = isPt
    ? [
        'Data',
        'Hora',
        'Tipo',
        'Categoria',
        'Descrição',
        'Fornecedor',
        'Forma de Pagamento',
        'Status',
        'Vencimento',
        'Valor (R$)',
      ]
    : [
        'Date',
        'Time',
        'Type',
        'Category',
        'Description',
        'Supplier',
        'Payment Method',
        'Status',
        'Due Date',
        'Amount (BRL)',
      ];

  const rows: string[] = [
    [isPt ? 'Oficina' : 'Shop', tenant.name, isPt ? 'Período' : 'Period', `${monthName} ${year}`]
      .map((cell) => escapeCsvCell(cell, sep))
      .join(sep),
    '',
    headers.map((h) => escapeCsvCell(h, sep)).join(sep),
  ];

  for (const tx of transactions) {
    const effectiveTs = tx.paidAt ?? tx.createdAt;
    const signedAmount = tx.type === 'EXPENSE' ? -Math.abs(tx.amount) : Math.abs(tx.amount);
    const typeLabel =
      tx.type === 'INCOME' ? (isPt ? 'Entrada' : 'Income') : isPt ? 'Despesa' : 'Expense';
    const statusLabel =
      tx.status === 'PAID' ? (isPt ? 'Pago' : 'Paid') : isPt ? 'Pendente' : 'Pending';

    rows.push(
      [
        formatIsoDate(effectiveTs, locale),
        formatIsoTime(effectiveTs),
        typeLabel,
        getCategoryLabel(tx.category, locale),
        formatTransactionDescription(tx.description, locale),
        tx.supplierName ?? '',
        getPaymentLabel(tx.paymentMethod, locale),
        statusLabel,
        tx.dueDate ? formatIsoDate(tx.dueDate, locale) : '',
        formatCsvNumber(signedAmount, locale),
      ]
        .map((cell) => escapeCsvCell(cell, sep))
        .join(sep)
    );
  }

  rows.push('');
  rows.push(
    [isPt ? 'RESUMO DO PERÍODO' : 'PERIOD SUMMARY', '', '', '', '', '', '', '', '', '']
      .map((c) => escapeCsvCell(c, sep))
      .join(sep)
  );
  rows.push(
    [isPt ? 'Total Entradas Pagas' : 'Total Paid Income', formatCsvNumber(summary.totalIncomePaid, locale)]
      .map((c) => escapeCsvCell(c, sep))
      .join(sep)
  );
  rows.push(
    [isPt ? 'Total Despesas Pagas' : 'Total Paid Expenses', formatCsvNumber(summary.totalExpensePaid, locale)]
      .map((c) => escapeCsvCell(c, sep))
      .join(sep)
  );
  rows.push(
    [isPt ? 'Saldo Líquido' : 'Net Balance', formatCsvNumber(summary.netBalance, locale)]
      .map((c) => escapeCsvCell(c, sep))
      .join(sep)
  );
  rows.push(
    [isPt ? 'Contas Pendentes (Fiado)' : 'Pending Payables', formatCsvNumber(summary.totalPendingPayables, locale)]
      .map((c) => escapeCsvCell(c, sep))
      .join(sep)
  );

  // UTF-8 BOM ensures Brazilian Excel renders Portuguese accents cleanly
  return `\uFEFF${rows.join('\r\n')}`;
}

export async function shareMonthlyFinanceCsv(params: MonthlyExportParams): Promise<void> {
  const csv = buildMonthlyFinanceCsv(params);
  const slug = slugifyMonth(params.year, params.monthIndex);
  const filename = `BenchOS_Extrato_${slug}.csv`;

  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, filename);
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(csv);

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error(
      params.locale === 'pt-BR'
        ? 'Compartilhamento de arquivos não disponível neste aparelho.'
        : 'File sharing is unavailable on this device.'
    );
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle:
      params.locale === 'pt-BR'
        ? `Extrato Financeiro ${slug} (CSV)`
        : `Financial Statement ${slug} (CSV)`,
    UTI: 'public.comma-separated-values-text',
  });
}

export async function shareMonthlyFinancePdf(params: MonthlyExportParams): Promise<void> {
  const { tenant, year, monthIndex, summary, transactions, locale } = params;
  const isPt = locale === 'pt-BR';
  const monthName = (isPt ? MONTH_FULL_PT : MONTH_FULL_EN)[monthIndex];
  const slug = slugifyMonth(year, monthIndex);
  const methods: TransactionPaymentMethod[] = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD'];
  const categories: TransactionCategory[] = ['PARTS_PURCHASE', 'OPERATIONAL_EXPENSE', 'OTHER'];

  const incomeRows = methods
    .map((m) => {
      const val = Number(summary.incomeByPaymentMethod[m] ?? 0);
      return `<tr><td>${escapeHtml(getPaymentLabel(m, locale))}</td><td class="num">${escapeHtml(formatMoney(val, locale))}</td></tr>`;
    })
    .join('');

  const expenseRows = categories
    .map((cat) => {
      const val = Number(summary.expenseByCategory[cat] ?? 0);
      return `<tr><td>${escapeHtml(getCategoryLabel(cat, locale))}</td><td class="num">${escapeHtml(formatMoney(val, locale))}</td></tr>`;
    })
    .join('');

  const txRows =
    transactions.length === 0
      ? `<tr><td colspan="6" style="text-align:center;color:#64748B;padding:18px">${escapeHtml(
          isPt ? 'Nenhuma movimentação registrada neste mês.' : 'No transactions recorded this month.'
        )}</td></tr>`
      : transactions
          .map((tx) => {
            const isIncome = tx.type === 'INCOME';
            const ts = tx.paidAt ?? tx.createdAt;
            const amountStr = `${isIncome ? '+' : '-'} ${formatMoney(tx.amount, locale)}`;
            const badgeClass = tx.status === 'PAID' ? 'badge-paid' : 'badge-pending';
            const badgeLabel =
              tx.status === 'PAID' ? (isPt ? 'PAGO' : 'PAID') : isPt ? 'PENDENTE' : 'PENDING';

            return `<tr>
              <td class="mono">${escapeHtml(formatIsoDate(ts, locale))}</td>
              <td>
                <div class="tx-desc">${escapeHtml(formatTransactionDescription(tx.description, locale))}</div>
                ${tx.supplierName ? `<div class="tx-sub">${escapeHtml(tx.supplierName)}</div>` : ''}
              </td>
              <td>${escapeHtml(getCategoryLabel(tx.category, locale))}</td>
              <td>${escapeHtml(getPaymentLabel(tx.paymentMethod, locale))}</td>
              <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
              <td class="num ${isIncome ? 'inc' : 'exp'}">${escapeHtml(amountStr)}</td>
            </tr>`;
          })
          .join('');

  const html = `<!DOCTYPE html>
<html lang="${isPt ? 'pt-BR' : 'en'}">
<head>
  <meta charset="UTF-8" />
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0F172A; font-size: 11.5px; line-height: 1.45; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0F172A; padding-bottom: 12px; margin-bottom: 14px; }
    .eyebrow { font-size: 9px; font-weight: 700; letter-spacing: 0.9px; color: #2563EB; text-transform: uppercase; }
    .shop { font-size: 18px; font-weight: 800; margin-top: 2px; }
    .meta { font-size: 10.5px; color: #475569; margin-top: 2px; }
    .period-box { text-align: right; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 8px 12px; }
    .period-val { font-size: 14px; font-weight: 800; color: #1D4ED8; }
    .kpi-grid { display: flex; gap: 8px; margin-bottom: 14px; }
    .kpi { flex: 1; border: 1px solid #E2E8F0; border-radius: 8px; padding: 9px 10px; background: #F8FAFC; }
    .kpi-label { font-size: 9px; font-weight: 700; letter-spacing: 0.5px; color: #64748B; text-transform: uppercase; }
    .kpi-val { font-size: 14px; font-weight: 800; margin-top: 3px; font-family: 'Courier New', monospace; }
    .inc { color: #065F46; }
    .exp { color: #B91C1C; }
    .warn { color: #B45309; }
    .split { display: flex; gap: 12px; margin-bottom: 14px; }
    .panel { flex: 1; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; margin-bottom: 14px; }
    .split .panel { margin-bottom: 0; }
    .panel-head { background: #F1F5F9; padding: 7px 10px; font-weight: 700; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; color: #334155; border-bottom: 1px solid #E2E8F0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px 8px; border-bottom: 1px solid #F1F5F9; text-align: left; vertical-align: top; }
    th { font-size: 9.5px; font-weight: 700; color: #64748B; text-transform: uppercase; background: #F8FAFC; }
    .num { text-align: right; font-family: 'Courier New', monospace; font-weight: 700; white-space: nowrap; }
    .mono { font-family: 'Courier New', monospace; white-space: nowrap; font-size: 10.5px; }
    .tx-desc { font-weight: 600; color: #0F172A; }
    .tx-sub { font-size: 10px; color: #64748B; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 99px; font-size: 9px; font-weight: 700; }
    .badge-paid { background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; }
    .badge-pending { background: #FFFBEB; color: #92400E; border: 1px solid #FDE68A; }
    .footer { margin-top: 10px; padding-top: 8px; border-top: 1px solid #E2E8F0; display: flex; justify-content: space-between; font-size: 9.5px; color: #64748B; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="eyebrow">${escapeHtml(isPt ? 'EXTRATO FINANCEIRO MENSAL · MEI / CONTABILIDADE' : 'MONTHLY FINANCIAL STATEMENT')}</div>
      <div class="shop">${escapeHtml(tenant.name)}</div>
      <div class="meta">${escapeHtml(maskCpfCnpj(tenant.document))} · ${escapeHtml(maskPhoneBR(tenant.phone))}</div>
    </div>
    <div class="period-box">
      <div class="eyebrow">${escapeHtml(isPt ? 'COMPETÊNCIA' : 'PERIOD')}</div>
      <div class="period-val">${escapeHtml(monthName)} ${year}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-label">${escapeHtml(isPt ? 'Entradas Pagas' : 'Paid Income')}</div>
      <div class="kpi-val inc">+ ${escapeHtml(formatMoney(summary.totalIncomePaid, locale))}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">${escapeHtml(isPt ? 'Despesas Pagas' : 'Paid Expenses')}</div>
      <div class="kpi-val exp">- ${escapeHtml(formatMoney(summary.totalExpensePaid, locale))}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">${escapeHtml(isPt ? 'Saldo Líquido' : 'Net Balance')}</div>
      <div class="kpi-val ${summary.netBalance >= 0 ? 'inc' : 'exp'}">${escapeHtml(formatMoney(summary.netBalance, locale))}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">${escapeHtml(isPt ? 'A Pagar (Fiado)' : 'Pending Payables')}</div>
      <div class="kpi-val warn">${escapeHtml(formatMoney(summary.totalPendingPayables, locale))}</div>
    </div>
  </div>

  <div class="split">
    <div class="panel">
      <div class="panel-head">${escapeHtml(isPt ? 'Entradas por Forma de Pagamento' : 'Income by Payment Method')}</div>
      <table><tbody>${incomeRows}</tbody></table>
    </div>
    <div class="panel">
      <div class="panel-head">${escapeHtml(isPt ? 'Despesas Pagas por Categoria' : 'Paid Expenses by Category')}</div>
      <table><tbody>${expenseRows}</tbody></table>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head">${escapeHtml(isPt ? `Movimentações do Mês (${transactions.length})` : `Monthly Transactions (${transactions.length})`)}</div>
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(isPt ? 'Data' : 'Date')}</th>
          <th>${escapeHtml(isPt ? 'Descrição' : 'Description')}</th>
          <th>${escapeHtml(isPt ? 'Categoria' : 'Category')}</th>
          <th>${escapeHtml(isPt ? 'Pagamento' : 'Method')}</th>
          <th>Status</th>
          <th class="num">${escapeHtml(isPt ? 'Valor' : 'Amount')}</th>
        </tr>
      </thead>
      <tbody>${txRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <span>BenchOS · ${escapeHtml(isPt ? 'Relatório auxiliar para conferência gerencial e MEI' : 'Management & accounting report')}</span>
    <span>${escapeHtml(formatIsoDate(new Date().toISOString(), locale))}</span>
  </div>
</body>
</html>`;

  await printAndShareHtmlPdf(
    html,
    `BenchOS_Extrato_${slug}.pdf`,
    isPt ? `Extrato Mensal ${monthName} ${year}` : `Monthly Statement ${monthName} ${year}`,
    locale
  );
}

export async function shareDailyCashClosingPdf(params: {
  tenant: TenantResponse;
  closing: DailyCashClosingResponse;
  locale: Locale;
}): Promise<void> {
  const { tenant, closing, locale } = params;
  const isPt = locale === 'pt-BR';
  const dateLabel = formatIsoDate(closing.date, locale);
  const methods: TransactionPaymentMethod[] = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD'];
  const cashIn = Number(closing.incomeByPaymentMethod.CASH ?? 0);
  const cashOut = Number(closing.expenseByPaymentMethod.CASH ?? 0);
  const cashDrawerNet = cashIn - cashOut;

  const methodRows = methods
    .map((m) => {
      const inc = Number(closing.incomeByPaymentMethod[m] ?? 0);
      const exp = Number(closing.expenseByPaymentMethod[m] ?? 0);
      const net = inc - exp;
      return `<tr>
        <td>${escapeHtml(getPaymentLabel(m, locale))}</td>
        <td class="num inc">+ ${escapeHtml(formatMoney(inc, locale))}</td>
        <td class="num exp">- ${escapeHtml(formatMoney(exp, locale))}</td>
        <td class="num">${escapeHtml(formatMoney(net, locale))}</td>
      </tr>`;
    })
    .join('');

  const txRows =
    closing.transactions.length === 0
      ? `<tr><td colspan="4" style="text-align:center;color:#64748B;padding:18px">${escapeHtml(
          isPt ? 'Nenhuma movimentação liquidada neste dia.' : 'No settled movements on this date.'
        )}</td></tr>`
      : closing.transactions
          .map((tx) => {
            const isIncome = tx.type === 'INCOME';
            const time = formatIsoTime(tx.paidAt ?? tx.createdAt);
            return `<tr>
              <td class="mono">${escapeHtml(time)}</td>
              <td>${escapeHtml(formatTransactionDescription(tx.description, locale))}${tx.supplierName ? ` · ${escapeHtml(tx.supplierName)}` : ''}</td>
              <td>${escapeHtml(getPaymentLabel(tx.paymentMethod, locale))}</td>
              <td class="num ${isIncome ? 'inc' : 'exp'}">${isIncome ? '+' : '-'} ${escapeHtml(formatMoney(tx.amount, locale))}</td>
            </tr>`;
          })
          .join('');

  const html = `<!DOCTYPE html>
<html lang="${isPt ? 'pt-BR' : 'en'}">
<head>
  <meta charset="UTF-8" />
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0F172A; font-size: 12px; line-height: 1.45; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0F172A; padding-bottom: 12px; margin-bottom: 14px; }
    .eyebrow { font-size: 9px; font-weight: 700; letter-spacing: 0.9px; color: #2563EB; text-transform: uppercase; }
    .shop { font-size: 18px; font-weight: 800; margin-top: 2px; }
    .meta { font-size: 10.5px; color: #475569; margin-top: 2px; }
    .date-box { text-align: right; background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px; padding: 8px 12px; }
    .date-val { font-size: 15px; font-weight: 800; color: #065F46; font-family: 'Courier New', monospace; }
    .kpi-grid { display: flex; gap: 8px; margin-bottom: 14px; }
    .kpi { flex: 1; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px; background: #F8FAFC; }
    .kpi-label { font-size: 9px; font-weight: 700; color: #64748B; text-transform: uppercase; }
    .kpi-val { font-size: 14px; font-weight: 800; margin-top: 3px; font-family: 'Courier New', monospace; }
    .inc { color: #065F46; }
    .exp { color: #B91C1C; }
    .panel { border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; margin-bottom: 14px; }
    .panel-head { background: #F1F5F9; padding: 8px 10px; font-weight: 700; font-size: 10.5px; text-transform: uppercase; color: #334155; border-bottom: 1px solid #E2E8F0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 7px 9px; border-bottom: 1px solid #F1F5F9; text-align: left; }
    th { font-size: 9.5px; font-weight: 700; color: #64748B; text-transform: uppercase; background: #F8FAFC; }
    .num { text-align: right; font-family: 'Courier New', monospace; font-weight: 700; white-space: nowrap; }
    .mono { font-family: 'Courier New', monospace; white-space: nowrap; }
    .footer { margin-top: 10px; padding-top: 8px; border-top: 1px solid #E2E8F0; display: flex; justify-content: space-between; font-size: 9.5px; color: #64748B; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="eyebrow">${escapeHtml(isPt ? 'FECHAMENTO DE CAIXA DIÁRIO' : 'DAILY CASH REGISTER CLOSING')}</div>
      <div class="shop">${escapeHtml(tenant.name)}</div>
      <div class="meta">${escapeHtml(maskCpfCnpj(tenant.document))} · ${escapeHtml(closing.zone)}</div>
    </div>
    <div class="date-box">
      <div class="eyebrow" style="color:#065F46">${escapeHtml(isPt ? 'DATA DO CAIXA' : 'CLOSING DATE')}</div>
      <div class="date-val">${escapeHtml(dateLabel)}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-label">${escapeHtml(isPt ? `Entradas (${closing.incomeCount})` : `Income (${closing.incomeCount})`)}</div>
      <div class="kpi-val inc">+ ${escapeHtml(formatMoney(closing.totalIncomePaid, locale))}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">${escapeHtml(isPt ? `Saídas (${closing.expenseCount})` : `Expenses (${closing.expenseCount})`)}</div>
      <div class="kpi-val exp">- ${escapeHtml(formatMoney(closing.totalExpensePaid, locale))}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">${escapeHtml(isPt ? 'Saldo do Dia' : 'Daily Net')}</div>
      <div class="kpi-val ${closing.netCashFlow >= 0 ? 'inc' : 'exp'}">${escapeHtml(formatMoney(closing.netCashFlow, locale))}</div>
    </div>
    <div class="kpi" style="background:#ECFDF5;border-color:#A7F3D0">
      <div class="kpi-label" style="color:#065F46">${escapeHtml(isPt ? 'Dinheiro em Gaveta' : 'Cash Drawer Net')}</div>
      <div class="kpi-val inc">${escapeHtml(formatMoney(cashDrawerNet, locale))}</div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head">${escapeHtml(isPt ? 'Conferência por Forma de Pagamento' : 'Breakdown by Payment Method')}</div>
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(isPt ? 'Forma de Pagamento' : 'Payment Method')}</th>
          <th class="num">${escapeHtml(isPt ? 'Entradas' : 'In')}</th>
          <th class="num">${escapeHtml(isPt ? 'Saídas' : 'Out')}</th>
          <th class="num">${escapeHtml(isPt ? 'Saldo' : 'Net')}</th>
        </tr>
      </thead>
      <tbody>${methodRows}</tbody>
    </table>
  </div>

  <div class="panel">
    <div class="panel-head">${escapeHtml(isPt ? `Movimentações Liquidadas (${closing.transactions.length})` : `Settled Movements (${closing.transactions.length})`)}</div>
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(isPt ? 'Hora' : 'Time')}</th>
          <th>${escapeHtml(isPt ? 'Descrição' : 'Description')}</th>
          <th>${escapeHtml(isPt ? 'Forma' : 'Method')}</th>
          <th class="num">${escapeHtml(isPt ? 'Valor' : 'Amount')}</th>
        </tr>
      </thead>
      <tbody>${txRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <span>BenchOS · ${escapeHtml(isPt ? 'Conferência de caixa de fim de expediente' : 'End-of-day cash register report')}</span>
    <span>${escapeHtml(dateLabel)}</span>
  </div>
</body>
</html>`;

  await printAndShareHtmlPdf(
    html,
    `BenchOS_Fechamento_${closing.date}.pdf`,
    isPt ? `Fechamento de Caixa ${dateLabel}` : `Daily Cash Closing ${dateLabel}`,
    locale
  );
}

function printHtmlInWebIframe(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
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

async function printAndShareHtmlPdf(
  html: string,
  filename: string,
  dialogTitle: string,
  _locale: Locale
): Promise<void> {
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
    targetFile.write(base64, { encoding: 'base64' });
    shareUri = targetFile.uri;
  } else {
    try {
      const generatedFile = new File(uri);
      generatedFile.copy(targetFile, { overwrite: true });
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
    dialogTitle,
    UTI: 'com.adobe.pdf',
  });
}
