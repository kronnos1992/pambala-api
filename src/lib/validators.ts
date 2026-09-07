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
  province: z.string().min(1),
  district: z.string().optional(),
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

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type StoreInput = z.infer<typeof storeSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
