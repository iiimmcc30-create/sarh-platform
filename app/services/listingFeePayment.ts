import { API_BASE } from "@/services/api";
import { authFetch } from "@/services/authFetch";
import type { NIPaymentMethod } from "@/services/network_international";

export type ListingFeePaymentInit = {
  paymentId?: string;
  checkoutUrl?: string;
  devMode?: boolean;
};

export type ListingFeeQuote = {
  listingId: string;
  feeId: string;
  saleAmount: number;
  ratePercent: number;
  commission: number;
  status: string;
};

export async function quoteListingFee(params: {
  listingId: string;
  saleAmount: number;
}): Promise<{ ok: true; data: ListingFeeQuote } | { ok: false; message: string }> {
  try {
    const res = await authFetch(`${API_BASE}/api/fees/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId: params.listingId,
        saleAmount: params.saleAmount,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success || !json.data) {
      return {
        ok: false,
        message: json.messageAr ?? json.message ?? "تعذّر حساب العمولة",
      };
    }
    return { ok: true, data: json.data as ListingFeeQuote };
  } catch {
    return { ok: false, message: "تعذّر الاتصال بالخادم" };
  }
}

export async function initiateListingFeePayment(params: {
  listingId: string;
  saleAmount: number;
  amount: number;
  method: NIPaymentMethod;
  listingTitle?: string;
}): Promise<
  { ok: true; data: ListingFeePaymentInit } | { ok: false; message: string }
> {
  try {
    const res = await authFetch(`${API_BASE}/api/payments/initiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: params.amount,
        saleAmount: params.saleAmount,
        currency: "SAR",
        method: params.method,
        type: "listing_fee",
        referenceId: params.listingId,
        description: `sarh listing fee ${params.listingId}`,
        descriptionAr: params.listingTitle
          ? `سداد عمولة إعلان — ${params.listingTitle}`
          : `سداد عمولة إعلان — ${params.listingId}`,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success || !json.data) {
      return {
        ok: false,
        message:
          json.messageAr ??
          json.message ??
          "تعذّر بدء عملية الدفع. حاول مرة أخرى.",
      };
    }
    return { ok: true, data: json.data as ListingFeePaymentInit };
  } catch {
    return { ok: false, message: "تعذّر الاتصال بالخادم" };
  }
}
