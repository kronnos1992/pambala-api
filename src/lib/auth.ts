import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "pambala-secret-key";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: {
  userId: string;
  role: string;
  roles?: string[];
  tokenVersion?: number;
}): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(
  token: string
): { userId: string; role: string; roles?: string[]; tokenVersion?: number } {
  return jwt.verify(token, JWT_SECRET) as {
    userId: string;
    role: string;
    roles?: string[];
    tokenVersion?: number;
  };
}
