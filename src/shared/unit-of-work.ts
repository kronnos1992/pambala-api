import { PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { BaseRepository } from "./repositories/base.repository";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export class UnitOfWork {
  private readonly client: DbClient;

  constructor(client?: DbClient) {
    this.client = client ?? prisma;
  }

  get current(): DbClient {
    return this.client;
  }

  repository<T extends BaseRepository>(repo: T): T {
    return repo.bind(this.client);
  }

  run<T>(fn: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      return fn(new UnitOfWork(tx));
    });
  }
}