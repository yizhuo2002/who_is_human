// server/src/ai/provider.ts
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";

// ---- Config & model init ----
const apiKey = process.env.GEMINI_API_KEY || "";
if (!apiKey) console.warn("[askLLM] Missing GEMINI_API_KEY");

const genAI = new GoogleGenerativeAI(apiKey);
const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";

const model = genAI.getGenerativeModel({
  model: modelName,
  systemInstruction:
    "You are a participant in a social deduction game 'Who is Human?'. " +
    "Respond briefly, naturally, and stay in character as a human.",
});

// Safety settings (tunable). If you suspect safety-blocks, set SAFETY_OFF=true in .env to test.
const SAFETY_OFF = (process.env.SAFETY_OFF || "").toLowerCase() === "true";
const SEXUAL: any = (HarmCategory as any).HARM_CATEGORY_SEXUAL_CONTENT;

const safetySettings = SAFETY_OFF
  ? [] // turn off to test quickly
  : ([
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      ...(SEXUAL ? [{
        category: SEXUAL,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      }] : []),
    ] as const);

let hasLoggedOneError = false;

// ---- Main call with layered fallbacks & better logging ----
export async function askLLM(prompt: string): Promise<string> {
  if (!apiKey) return "(AI unavailable: missing API key)";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    // First attempt: structured request (preferred)
    const res = await model.generateContent(
      {
        contents: [{ role: "user", parts: [{ text: String(prompt) }]}],
        safetySettings: safetySettings as any,
      },
      { signal: controller.signal }
    );
    const text = res?.response?.text?.() ?? "";
    if (text.trim()) return text.trim();

    // If empty, try a super-simple fallback call
    const res2 = await model.generateContent(String(prompt));
    const text2 = res2?.response?.text?.() ?? "";
    return text2.trim() || "(no response)";
  } catch (err: any) {
    // Log detailed info once to help diagnose root cause
    if (!hasLoggedOneError) {
      hasLoggedOneError = true;
      const code = err?.status || err?.code;
      const name = err?.name;
      const msg = err?.message || String(err);
      const details = JSON.stringify(err?.response || err?.error || {}, null, 2);
      console.error(
        "[askLLM] error:",
        JSON.stringify({ model: modelName, code, name, msg }, null, 2)
      );
      if (details && details !== "{}") {
        console.error("[askLLM] details:", details);
      }
      console.error(
        "[askLLM] tips: verify API is enabled & billing, model name valid, key not restricted, and firewall/SSL allow outbound."
      );
    }
    return "(AI error)";
  } finally {
    clearTimeout(timeout);
  }
}
