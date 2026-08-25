import { Context, Next } from "hono";

export type AppEnv = {
  Variables: {
    userId: string;
    role: string;
  };
};

export type AppContext = Context<AppEnv>;
