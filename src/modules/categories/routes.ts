import { Hono } from "hono";
import { mediator } from "../../shared/mediator";
import {
  ListCategoriesQuery,
  GetCategoryQuery,
} from "../../handlers/categories.handlers";

const categories = new Hono();

categories.get("/", async (c) => {
  const locale = c.req.query("locale");
  const result = await mediator.query(new ListCategoriesQuery(locale));

  return c.json({ categories: result });
});

categories.get("/:id", async (c) => {
  const id = c.req.param("id")!;
  const locale = c.req.query("locale");

  const category = await mediator.query(new GetCategoryQuery(id, locale));

  return c.json({ category });
});

export default categories;