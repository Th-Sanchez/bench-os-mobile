export type Role = 'OWNER' | 'ATTENDANT' | 'TECHNICIAN';

export type DevicePlatform = 'ANDROID' | 'IOS' | 'WEB';

export type Voltage = 'V110' | 'V220' | 'BIVOLT' | 'BATTERY' | 'UNKNOWN';

export type ItemStatus =
  | 'RECEIVED'
  | 'DIAGNOSING'
  | 'QUOTE_SENT'
  | 'APPROVED'
  | 'WAITING_PARTS'
  | 'IN_REPAIR'
  | 'READY_FOR_PICKUP'
  | 'DELIVERED'
  | 'REJECTED'
  | 'DISCARDED'
  | 'CANCELLED';

export type OrderPaymentMethod = 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'CASH';

export type PhotoStage = 'INTAKE' | 'DIAGNOSIS' | 'COMPLETED';

export type WhatsappMessageStage = 'INTAKE' | 'QUOTE' | 'READY';

export type TransactionType = 'INCOME' | 'EXPENSE';

export type TransactionCategory =
  | 'REPAIR_PAYMENT'
  | 'PARTS_PURCHASE'
  | 'OPERATIONAL_EXPENSE'
  | 'OTHER';

export type TransactionPaymentMethod =
  | 'PIX'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'CASH'
  | 'STORE_CREDIT';

export type TransactionStatus = 'PENDING' | 'PAID';

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  errors?: Record<string, string>;
  timestamp?: string;
  requestId?: string;
}

// IAM
export interface UserResponse {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export interface TenantResponse {
  id: string;
  name: string;
  document: string;
  phone: string;
  active: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  expiresAt: string;
  user: UserResponse;
  tenant: TenantResponse;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

export interface MessageResponse {
  message: string;
}

export interface RegisterTenantRequest {
  shopName: string;
  document: string;
  phone: string;
  ownerName: string;
  email: string;
  password: string;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export interface ResetUserPasswordRequest {
  newPassword: string;
}

export interface RegisterPushTokenRequest {
  expoPushToken: string;
  platform: DevicePlatform;
  deviceName?: string;
}

export interface PushTokenResponse {
  id: string;
  expoPushToken: string;
  platform: DevicePlatform;
  deviceName: string | null;
  updatedAt: string;
}

export interface TenantSettingsResponse {
  tenantId: string;
  defaultLaborCost: number;
  defaultEstimatedDays: number;
  abandonmentDays: number;
  whatsappIntakeTemplate: string | null;
  whatsappQuoteTemplate: string | null;
  whatsappReadyTemplate: string | null;
  customApplianceTypes: string[];
}

export interface UpdateTenantSettingsRequest {
  defaultLaborCost: number;
  defaultEstimatedDays: number;
  abandonmentDays: number;
  whatsappIntakeTemplate?: string;
  whatsappQuoteTemplate: string;
  whatsappReadyTemplate?: string;
}

// Customer
export interface CustomerResponse {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  document: string | null;
  notes: string | null;
  createdAt: string;
}

export interface UpsertCustomerRequest {
  name: string;
  phone: string;
  document?: string;
  notes?: string;
}

// Order
export interface CreateServiceOrderItemRequest {
  applianceType: string;
  brand: string;
  model?: string;
  voltage: Voltage;
  serialNumber?: string;
  accessories?: string;
  reportedIssue: string;
}

export interface CreateServiceOrderRequest {
  customerId: string;
  notes?: string;
  items: CreateServiceOrderItemRequest[];
}

export interface ServiceOrderItemResponse {
  id: string;
  itemIndex: number;
  tag: string;
  applianceType: string;
  brand: string;
  model: string | null;
  voltage: Voltage;
  serialNumber: string | null;
  accessories: string | null;
  reportedIssue: string;
  technicalDiagnosis: string | null;
  status: ItemStatus;
  laborCost: number;
  partsCost: number;
  discount: number;
  totalPrice: number;
  estimatedCompletionDate: string | null;
  warrantyDays: number;
  cancellationReason: string | null;
  approvedAt: string | null;
  finishedAt: string | null;
  deliveredAt: string | null;
  discardedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceOrderResponse {
  id: string;
  tenantId: string;
  orderNumber: number;
  publicToken: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  createdByUserId: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: ServiceOrderItemResponse[];
}

export interface OrderItemQueueResponse {
  id: string;
  serviceOrderId: string;
  orderNumber: number;
  itemIndex: number;
  tag: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  applianceType: string;
  brand: string;
  model: string | null;
  voltage: Voltage;
  reportedIssue: string;
  status: ItemStatus;
  totalPrice: number;
  estimatedCompletionDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateItemQuoteRequest {
  technicalDiagnosis?: string;
  laborCost: number;
  partsCost: number;
  discount: number;
  warrantyDays?: number;
}

export interface TransitionItemStatusRequest {
  status: ItemStatus;
  cancellationReason?: string;
}

export interface PaymentPartRequest {
  paymentMethod: OrderPaymentMethod;
  amount: number;
}

export interface DeliverItemRequest {
  payments?: PaymentPartRequest[];
}

export interface WhatsappLinkResponse {
  message: string;
  whatsappUrl: string;
}

// Photos
export interface PresignPhotoUploadRequest {
  stage: PhotoStage;
  contentType: string;
}

export interface PresignPhotoUploadResponse {
  storageKey: string;
  uploadUrl: string;
  contentType: string;
  stage: PhotoStage;
  expiresAt: string;
}

export interface RegisterItemPhotoRequest {
  storageKey: string;
  stage: PhotoStage;
  contentType: string;
}

export interface ItemPhotoResponse {
  id: string;
  serviceOrderItemId: string;
  storageKey: string;
  contentType: string;
  stage: PhotoStage;
  viewUrl: string;
  viewUrlExpiresAt: string;
  createdAt: string;
}

// Public Tracking
export interface PublicOrderItemPhotoResponse {
  id: string;
  stage: PhotoStage;
  viewUrl: string;
  viewUrlExpiresAt: string;
  createdAt: string;
}

export interface PublicOrderItemResponse {
  itemIndex: number;
  tag: string;
  applianceType: string;
  brand: string;
  model: string | null;
  status: ItemStatus;
  technicalDiagnosis: string | null;
  totalPrice: number;
  estimatedCompletionDate: string | null;
  warrantyDays: number;
  approvedAt: string | null;
  finishedAt: string | null;
  deliveredAt: string | null;
  discardedAt: string | null;
  photos: PublicOrderItemPhotoResponse[];
}

export interface PublicOrderResponse {
  shopName: string;
  shopPhone: string | null;
  orderNumber: number;
  createdAt: string;
  items: PublicOrderItemResponse[];
}

// Finance
export interface SupplierResponse {
  id: string;
  tenantId: string;
  name: string;
  phone: string | null;
  notes: string | null;
  createdAt: string;
}

export interface UpsertSupplierRequest {
  name: string;
  phone?: string;
  notes?: string;
}

export interface CreateFinancialTransactionRequest {
  type: TransactionType;
  category: TransactionCategory;
  serviceOrderItemId?: string;
  supplierId?: string;
  description: string;
  amount: number;
  paymentMethod: TransactionPaymentMethod;
  status?: TransactionStatus;
  dueDate?: string;
}

export interface FinancialTransactionResponse {
  id: string;
  tenantId: string;
  type: TransactionType;
  category: TransactionCategory;
  serviceOrderItemId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  description: string;
  amount: number;
  paymentMethod: TransactionPaymentMethod;
  status: TransactionStatus;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface FinancialSummaryResponse {
  periodStart: string;
  periodEnd: string;
  totalIncomePaid: number;
  totalExpensePaid: number;
  netBalance: number;
  totalPendingPayables: number;
  totalOverduePayables: number;
  incomeByPaymentMethod: Partial<Record<TransactionPaymentMethod, number>>;
  expenseByCategory: Partial<Record<TransactionCategory, number>>;
}
