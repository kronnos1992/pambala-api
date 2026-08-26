import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(6),
  role: z.enum(["BUYER", "SELLER"]).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
  paymentMethod: z.enum([
    "MULTICAIXA",
    "TRANSFER",
    "CASH_ON_DELIVERY",
    "APPY_PAY_GPO",
    "APPY_PAY_REF",
  ]),
  notes: z.string().optional(),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  productId: z.string().optional(),
  storeId: z.string().optional(),
});
