import { Hono } from "hono";
import { mediator } from "../../shared/mediator";
import { authFilter } from "../../shared/filters/auth.filter";
import { BadRequestError } from "../../shared/errors";
import { UploadFileCommand } from "../../handlers/uploads.handlers";

const uploads = new Hono();

uploads.post("/", authFilter, async (c) => {
  const contentType = c.req.header("content-type") || "";

  if (!contentType.includes("multipart/form-data")) {
    throw new BadRequestError("Apenas uploads multipart são aceites");
  }

  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || typeof file === "string") {
    throw new BadRequestError("Nenhum ficheiro enviado");
  }

  const result = await mediator.send(new UploadFileCommand(file));

  return c.json(result, 201);
});

export default uploads;