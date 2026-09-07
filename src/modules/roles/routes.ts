import { Hono } from "hono";
import { z } from "zod";
import { mediator } from "../../shared/mediator";
import { authFilter } from "../../shared/filters/auth.filter";
import { requirePermission } from "../../shared/filters/permission.filter";
import { PERMISSIONS } from "../../lib/permissions";
import {
  ListRolesQuery,
  ListResponsibilitiesQuery,
  CreateRoleCommand,
  UpdateRoleCommand,
  DeleteRoleCommand,
  SetRoleResponsibilitiesCommand,
  CreateResponsibilityCommand,
  UpdateResponsibilityCommand,
  DeleteResponsibilityCommand,
} from "../../handlers/roles.handlers";

const roles = new Hono();

// Leitura pública (catálogo de roles e responsabilidades)
roles.get("/", async (c) => {
  const result = await mediator.query(new ListRolesQuery());
  return c.json(result);
});

roles.get("/responsibilities", async (c) => {
  const result = await mediator.query(new ListResponsibilitiesQuery());
  return c.json(result);
});

// Gestão (apenas quem tem a responsabilidade admin.roles.manage)
const manage = new Hono();
manage.use("*", authFilter);
manage.use("*", requirePermission(PERMISSIONS.adminRolesManage));

const roleBodySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});

manage.post("/", async (c) => {
  const body = await c.req.json();
  const data = roleBodySchema.parse(body);
  const result = await mediator.send(
    new CreateRoleCommand(data.key, data.name, data.description)
  );
  return c.json(result, 201);
});

manage.put("/:key", async (c) => {
  const key = c.req.param("key")!;
  const body = await c.req.json();
  const data = z.object({ name: z.string().min(1).optional(), description: z.string().nullable().optional() }).parse(body);
  const result = await mediator.send(new UpdateRoleCommand(key, data));
  return c.json(result);
});

manage.delete("/:key", async (c) => {
  const key = c.req.param("key")!;
  const result = await mediator.send(new DeleteRoleCommand(key));
  return c.json(result);
});

manage.put("/:key/responsibilities", async (c) => {
  const key = c.req.param("key")!;
  const body = await c.req.json();
  const data = z.object({ responsibilityKeys: z.array(z.string()) }).parse(body);
  const result = await mediator.send(
    new SetRoleResponsibilitiesCommand(key, data.responsibilityKeys)
  );
  return c.json(result);
});

const responsibilityBodySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});

manage.post("/responsibilities", async (c) => {
  const body = await c.req.json();
  const data = responsibilityBodySchema.parse(body);
  const result = await mediator.send(
    new CreateResponsibilityCommand(data.key, data.name, data.description)
  );
  return c.json(result, 201);
});

manage.put("/responsibilities/:key", async (c) => {
  const key = c.req.param("key")!;
  const body = await c.req.json();
  const data = z.object({ name: z.string().min(1).optional(), description: z.string().nullable().optional() }).parse(body);
  const result = await mediator.send(new UpdateResponsibilityCommand(key, data));
  return c.json(result);
});

manage.delete("/responsibilities/:key", async (c) => {
  const key = c.req.param("key")!;
  const result = await mediator.send(new DeleteResponsibilityCommand(key));
  return c.json(result);
});

roles.route("/", manage);

export default roles;