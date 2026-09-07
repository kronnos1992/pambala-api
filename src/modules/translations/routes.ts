import { Hono } from "hono";
import { translateHandler, translateBatchHandler } from "@/handlers/translations.handlers";

const translationRoutes = new Hono();

translationRoutes.post("/translate", translateHandler);
translationRoutes.post("/translate-batch", translateBatchHandler);

export default translationRoutes;
