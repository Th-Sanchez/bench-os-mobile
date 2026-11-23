import { apiRequest } from './http';
import type {
  AuthResponse,
  CreateFinancialTransactionRequest,
  CreateServiceOrderRequest,
  CreateUserRequest,
  CustomerResponse,
  DeliverItemRequest,
  FinancialSummaryResponse,
  FinancialTransactionResponse,
  ItemPhotoResponse,
  ItemStatus,
  LoginRequest,
  OrderItemQueueResponse,
  PageResponse,
  PresignPhotoUploadRequest,
  PresignPhotoUploadResponse,
  PublicOrderResponse,
  RegisterItemPhotoRequest,
  RegisterTenantRequest,
  ServiceOrderItemResponse,
  ServiceOrderResponse,
  SupplierResponse,
  TenantSettingsResponse,
  TransactionCategory,
  TransactionPaymentMethod,
  TransactionStatus,
  TransactionType,
  TransitionItemStatusRequest,
  UpdateItemQuoteRequest,
  UpdateTenantSettingsRequest,
  UpsertCustomerRequest,
  UpsertSupplierRequest,
  UserResponse,
  WhatsappLinkResponse,
} from '@/types/api';

export const authApi = {
  login: (payload: LoginRequest) =>
    apiRequest<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: payload,
      skipAuth: true,
    }),

  register: (payload: RegisterTenantRequest) =>
    apiRequest<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: payload,
      skipAuth: true,
    }),
};

export const usersApi = {
  me: () => apiRequest<UserResponse>('/api/v1/users/me'),
  list: () => apiRequest<UserResponse[]>('/api/v1/users'),
  create: (payload: CreateUserRequest) =>
    apiRequest<UserResponse>('/api/v1/users', { method: 'POST', body: payload }),
  updateStatus: (id: string, active: boolean) =>
    apiRequest<UserResponse>(`/api/v1/users/${id}/status`, { method: 'PATCH', body: { active } }),
};

export const tenantSettingsApi = {
  get: () => apiRequest<TenantSettingsResponse>('/api/v1/tenant/settings'),
  update: (payload: UpdateTenantSettingsRequest) =>
    apiRequest<TenantSettingsResponse>('/api/v1/tenant/settings', { method: 'PUT', body: payload }),
};

export const customersApi = {
  search: (query?: string) =>
    apiRequest<CustomerResponse[]>('/api/v1/customers', { query: { query } }),
  get: (id: string) => apiRequest<CustomerResponse>(`/api/v1/customers/${id}`),
  create: (payload: UpsertCustomerRequest) =>
    apiRequest<CustomerResponse>('/api/v1/customers', { method: 'POST', body: payload }),
  update: (id: string, payload: UpsertCustomerRequest) =>
    apiRequest<CustomerResponse>(`/api/v1/customers/${id}`, { method: 'PUT', body: payload }),
  remove: (id: string) =>
    apiRequest<void>(`/api/v1/customers/${id}`, { method: 'DELETE' }),
};

export const ordersApi = {
  create: (payload: CreateServiceOrderRequest) =>
    apiRequest<ServiceOrderResponse>('/api/v1/orders', { method: 'POST', body: payload }),

  list: (params?: {
    orderNumber?: number;
    customerId?: string;
    status?: ItemStatus;
    page?: number;
    size?: number;
  }) => apiRequest<PageResponse<ServiceOrderResponse>>('/api/v1/orders', { query: params }),

  get: (id: string) => apiRequest<ServiceOrderResponse>(`/api/v1/orders/${id}`),

  listBenchQueue: (params?: {
    status?: ItemStatus[];
    tag?: string;
    page?: number;
    size?: number;
  }) => apiRequest<PageResponse<OrderItemQueueResponse>>('/api/v1/order-items', { query: params }),

  listAbandonmentEligible: (params?: { page?: number; size?: number }) =>
    apiRequest<PageResponse<OrderItemQueueResponse>>('/api/v1/order-items/abandonment-eligible', {
      query: params,
    }),

  updateQuote: (orderId: string, itemId: string, payload: UpdateItemQuoteRequest) =>
    apiRequest<ServiceOrderItemResponse>(`/api/v1/orders/${orderId}/items/${itemId}/quote`, {
      method: 'PATCH',
      body: payload,
    }),

  transitionStatus: (orderId: string, itemId: string, payload: TransitionItemStatusRequest) =>
    apiRequest<ServiceOrderItemResponse>(`/api/v1/orders/${orderId}/items/${itemId}/status`, {
      method: 'POST',
      body: payload,
    }),

  deliverItem: (orderId: string, itemId: string, payload?: DeliverItemRequest) =>
    apiRequest<ServiceOrderItemResponse>(`/api/v1/orders/${orderId}/items/${itemId}/deliver`, {
      method: 'POST',
      body: payload ?? {},
    }),

  getWhatsappLink: (orderId: string, itemId: string) =>
    apiRequest<WhatsappLinkResponse>(`/api/v1/orders/${orderId}/items/${itemId}/whatsapp-link`),
};

export const photosApi = {
  presign: (orderId: string, itemId: string, payload: PresignPhotoUploadRequest) =>
    apiRequest<PresignPhotoUploadResponse>(`/api/v1/orders/${orderId}/items/${itemId}/photos/presign`, {
      method: 'POST',
      body: payload,
    }),

  register: (orderId: string, itemId: string, payload: RegisterItemPhotoRequest) =>
    apiRequest<ItemPhotoResponse>(`/api/v1/orders/${orderId}/items/${itemId}/photos`, {
      method: 'POST',
      body: payload,
    }),

  list: (orderId: string, itemId: string) =>
    apiRequest<ItemPhotoResponse[]>(`/api/v1/orders/${orderId}/items/${itemId}/photos`),

  remove: (orderId: string, itemId: string, photoId: string) =>
    apiRequest<void>(`/api/v1/orders/${orderId}/items/${itemId}/photos/${photoId}`, {
      method: 'DELETE',
    }),
};

export const publicOrderApi = {
  getByToken: (publicToken: string) =>
    apiRequest<PublicOrderResponse>(`/api/v1/public/orders/${publicToken}`, { skipAuth: true }),
};

export const financeApi = {
  getSummary: (params?: { from?: string; to?: string }) =>
    apiRequest<FinancialSummaryResponse>('/api/v1/finance/summary', { query: params }),

  listTransactions: (params?: {
    type?: TransactionType;
    category?: TransactionCategory;
    status?: TransactionStatus;
    paymentMethod?: TransactionPaymentMethod;
    supplierId?: string;
    from?: string;
    to?: string;
    overdueOnly?: boolean;
    page?: number;
    size?: number;
  }) =>
    apiRequest<PageResponse<FinancialTransactionResponse>>('/api/v1/finance/transactions', {
      query: params,
    }),

  createTransaction: (payload: CreateFinancialTransactionRequest) =>
    apiRequest<FinancialTransactionResponse>('/api/v1/finance/transactions', {
      method: 'POST',
      body: payload,
    }),

  payTransaction: (id: string, paymentMethod?: TransactionPaymentMethod) =>
    apiRequest<FinancialTransactionResponse>(`/api/v1/finance/transactions/${id}/pay`, {
      method: 'POST',
      body: paymentMethod ? { paymentMethod } : {},
    }),

  listSuppliers: (query?: string) =>
    apiRequest<SupplierResponse[]>('/api/v1/finance/suppliers', { query: { query } }),

  createSupplier: (payload: UpsertSupplierRequest) =>
    apiRequest<SupplierResponse>('/api/v1/finance/suppliers', { method: 'POST', body: payload }),

  updateSupplier: (id: string, payload: UpsertSupplierRequest) =>
    apiRequest<SupplierResponse>(`/api/v1/finance/suppliers/${id}`, { method: 'PUT', body: payload }),

  deleteSupplier: (id: string) =>
    apiRequest<void>(`/api/v1/finance/suppliers/${id}`, { method: 'DELETE' }),
};
