import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import {
  hashPassword,
  comparePassword,
  generateToken,
  authMiddleware,
} from "../lib/auth";
import { registerSchema, loginSchema } from "../lib/validators";

const auth = new Hono();

auth.post("/register", async (c) => {
  const body = await c.req.json();
  const data = registerSchema.parse(body);

  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    return c.json({ error: "Email já está em uso" }, 409);
  }

  const hashedPassword = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: hashedPassword,
      role: data.role || "BUYER",
    },
  });

  const token = generateToken({ userId: user.id, role: user.role });

  return c.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
    },
  }, 201);
});

auth.post("/login", async (c) => {
  const body = await c.req.json();
  const data = loginSchema.parse(body);

  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (!user) {
    return c.json({ error: "Credenciais inválidas" }, 401);
  }

  const isPasswordValid = await comparePassword(data.password, user.password);

  if (!isPasswordValid) {
    return c.json({ error: "Credenciais inválidas" }, 401);
  }

  const token = generateToken({ userId: user.id, role: user.role });

  return c.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
    },
  });
});

auth.get("/me", authMiddleware, async (c) => {
  const userId = (c as any).get("userId") as string;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      avatar: true,
      createdAt: true,
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
          isVerified: true,
        },
      },
    },
  });

  if (!user) {
    return c.json({ error: "Usuário não encontrado" }, 404);
  }

  return c.json({ user });
});

auth.put("/me", authMiddleware, async (c) => {
  const userId = (c as any).get("userId") as string;
  const body = await c.req.json();

  const updateData: any = {};
  if (body.name) updateData.name = body.name;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.avatar !== undefined) updateData.avatar = body.avatar;

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      avatar: true,
    },
  });

  return c.json({ user });
});

export default auth;
