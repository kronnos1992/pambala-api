import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().transform((val) => val.trim().toLowerCase()),
  phone: z.string().optional(),
  password: z.string().min(6),
  role: z.enum(["BUYER", "SELLER"]).optional(),
  aiValidationConsent: z.boolean().optional(),
});

export const loginSchema = z.object({
  email: z.string().email().transform((val) => val.trim().toLowerCase()),
  password: z.string().min(1),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  avatar: z.string().optional(),
  aiValidationConsent: z.boolean().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6).optional(),
});

export const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  comparePrice: z.number().positive().optional(),
  images: z.array(z.string()).default([]),
  condition: z.enum(["NEW", "USED", "REFURBISHED"]).default("NEW"),
  stock: z.number().min(0).default(1),
  categoryId: z.string().min(1),
  isActive: z.boolean().optional(),
  translations: z
    .array(
      z.object({
        locale: z.string().min(1),
        name: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .optional(),
});

export const storeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  phone: z.string().optional(),
  logo: z.string().optional(),
  banner: z.string().optional(),
  province: z.string().min(1),
  district: z.string().optional(),
  categoryIds: z.array(z.string().min(1)).optional(),
});

export const orderSchema = z.object({
  shippingName: z.string().min(1),
  shippingPhone: z.string().min(1),
  shippingAddress: z.string().min(1),
  shippingProvince: z.string().min(1),
  shippingDistrict: z.string().optional(),
  storeId: z.string().min(1),
  paymentMethod: z.enum(["EXPRESS", "TRANSFER", "REFERENCE", "CASH_ON_DELIVERY"]),
  notes: z.string().optional(),
});

export const paymentMethodSchema = z.object({
  payments: z.array(
    z.object({
      type: z.enum(["EXPRESS", "TRANSFER", "REFERENCE", "CASH_ON_DELIVERY"]),
      enabled: z.boolean().default(true),
      phone: z.string().optional(),
      bankName: z.string().optional(),
      bankAccount: z.string().optional(),
      iban: z.string().optional(),
      entity: z.string().optional(),
      reference: z.string().optional(),
      ownerName: z.string().optional(),
    })
  ),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  productId: z.string().optional(),
  storeId: z.string().optional(),
});

export const fiscalProfileSchema = z.object({
  nif: z.string().min(1).max(40),
  legalName: z.string().min(1),
  address: z.string().min(1),
  province: z.string().min(1),
  district: z.string().optional(),
  industryCode: z.string().optional(),
  vatRegime: z.enum(["GERAL", "SIMPLIFICADO", "EXCLUIDO", "ISENTO"]).default("GERAL"),
  establishmentRegistered: z.boolean().optional(),
});

export const fiscalSeriesSchema = z.object({
  documentType: z.enum(["FT", "NC", "ND"]),
  prefix: z.string().min(1).max(10).regex(/^[A-Z0-9]+$/),
  year: z.number().int().min(2000).max(2100).optional(),
});

export const fiscalSettingsSchema = z.object({
  softwareName: z.string().min(1).optional(),
  softwareVersion: z.string().min(1).optional(),
  softwareProvider: z.string().min(1).optional(),
  certificationNumber: z.string().optional().nullable(),
  certificationDate: z.string().optional().nullable(),
  hashSecret: z.string().min(8).optional(),
  agtBaseUrl: z.string().url().optional().nullable(),
  agtApiToken: z.string().optional().nullable(),
  timezone: z.string().min(1).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type StoreInput = z.infer<typeof storeSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
