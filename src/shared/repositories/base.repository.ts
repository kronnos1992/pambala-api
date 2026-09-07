import { prisma } from "../../lib/prisma";
import type { DbClient } from "../unit-of-work";

export abstract class BaseRepository {
  protected client: DbClient;

  constructor(client?: DbClient) {
    this.client = client ?? prisma;
  }

  get db(): DbClient {
    return this.client;
  }

  bind(client: DbClient): this {
    return Object.assign(Object.create(this), { client });
  }
}