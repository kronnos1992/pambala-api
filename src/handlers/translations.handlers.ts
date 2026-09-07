import { Context } from "hono";
import { spawn } from "child_process";
import path from "path";

interface TranslateRequest {
  texts: string[];
  locale: string;
  source?: string;
}

interface TranslateBatchRequest {
  items: {
    id: string;
    text: string;
  }[];
  locale: string;
  source?: string;
}

function runPythonTranslate(data: object): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.resolve(__dirname, "../../translation_agent/translate_api.py");
    const pythonProcess = spawn("python", [pythonScript]);
    
    let stdout = "";
    let stderr = "";

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}: ${stderr}`));
      } else {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse Python output: ${stdout}`));
        }
      }
    });

    pythonProcess.on("error", reject);
    
    // Send data as JSON to stdin
    pythonProcess.stdin.write(JSON.stringify(data));
    pythonProcess.stdin.end();
  });
}

/**
 * Traduz um array de textos usando o Python translation_agent
 */
export const translateHandler = async (c: Context) => {
  try {
    const body = await c.req.json<TranslateRequest>();
    const { texts, locale, source = "pt" } = body;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return c.json({ error: "texts array is required" }, 400);
    }

    if (!locale) {
      return c.json({ error: "locale is required" }, 400);
    }

    // Validar locale
    const validLocales = ["en", "es", "fr", "zh", "ar"];
    if (!validLocales.includes(locale)) {
      return c.json(
        { error: `Invalid locale. Supported: ${validLocales.join(", ")}` },
        400
      );
    }

    // Se for português, retorna os próprios textos
    if (locale === source) {
      return c.json({
        success: true,
        translations: Object.fromEntries(texts.map((t) => [t, t])),
      });
    }

    // Chamar o translation_agent Python
    try {
      const result = await runPythonTranslate({
        texts,
        locale,
        source,
      });

      return c.json({
        success: true,
        translations: result,
      });
    } catch (execError: any) {
      console.error("Translation agent error:", execError);
      return c.json(
        {
          error: "Translation service unavailable",
          details: execError.message,
        },
        503
      );
    }
  } catch (error) {
    console.error("Translation error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
};

/**
 * Traduz um batch de itens com IDs, devolvendo mapa id -> tradução
 */
export const translateBatchHandler = async (c: Context) => {
  try {
    const body = await c.req.json<TranslateBatchRequest>();
    const { items, locale, source = "pt" } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return c.json({ error: "items array is required" }, 400);
    }

    if (!locale) {
      return c.json({ error: "locale is required" }, 400);
    }

    const validLocales = ["en", "es", "fr", "zh", "ar"];
    if (!validLocales.includes(locale)) {
      return c.json(
        { error: `Invalid locale. Supported: ${validLocales.join(", ")}` },
        400
      );
    }

    if (locale === source) {
      return c.json({
        success: true,
        translations: Object.fromEntries(items.map((i) => [i.id, i.text])),
      });
    }

    const texts = items.map((i) => i.text);

    try {
      const translations = await runPythonTranslate({
        texts,
        locale,
        source,
      });

      const result = Object.fromEntries(
        items.map((item, idx) => [item.id, translations[texts[idx]] || item.text])
      );

      return c.json({
        success: true,
        translations: result,
      });
    } catch (execError: any) {
      console.error("Translation agent error:", execError);
      return c.json(
        {
          error: "Translation service unavailable",
          details: execError.message,
        },
        503
      );
    }
  } catch (error) {
    console.error("Translation batch error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
};
