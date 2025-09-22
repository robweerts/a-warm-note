// server.js (of /api/generate-message.js in serverless)
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/**
 * POST /api/generate-message
 * body: { lang: "nl"|"en", sentiments?: string[], to?: string, from?: string, special_day?: "valentine"|"newyear"|"easter"|null }
 */
app.post("/api/generate-message", async (req, res) => {
  const { lang = "nl", sentiments = [], to = "", from = "", special_day = null } = req.body || {};
  // Guardrails
  const safeLang = (lang === "en") ? "en" : "nl";
  const sents = Array.isArray(sentiments) ? sentiments.slice(0,3) : [];
  const toName = String(to || "").slice(0, 40);
  const fromName = String(from || "").slice(0, 40);
  const day = special_day && ["valentine","newyear","easter"].includes(special_day) ? special_day : null;

  // Compact prompt (korte, warme 1-liner; geen privé info)
  const prompt = buildPrompt({ lang: safeLang, sentiments: sents, toName, fromName, day });

  try {
    const aiText = await callLLM(prompt); // <-- implementeer met jouw provider
    // Post-process: 1 regel, max ~120 chars, geen hashtags/links
    const text = sanitize(aiText);
    res.json({
      ok: true,
      message: {
        id: null,                 // runtime only
        icon: chooseIcon({ lang: safeLang, sentiments: sents, day }),
        text,
        sentiments: sents,
        special_day: day,
        weight: 1
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "gen_failed" });
  }
});

function buildPrompt({ lang, sentiments, toName, fromName, day }){
  const L = (lang === "en");
  const sline = sentiments.length ? (L ? `Tone/sentiment: ${sentiments.join(", ")}.` : `Toon/gevoel: ${sentiments.join(", ")}.`) : "";
  const names = (toName || fromName) ? (L ? `Personalize softly for To: "${toName || ""}" and From: "${fromName || ""}".` :
                                          `Personaliseer zacht voor Voor: "${toName || ""}" en Van: "${fromName || ""}".`) : "";
  const season = day ? (L ? `Occasion: ${day}.` : `Gelegenheid: ${day}.`) : "";
  const ask = L
    ? `Write ONE short, warm, encouraging line (max ~120 chars). No hashtags, no links.`
    : `Schrijf ÉÉN korte, warme, bemoedigende zin (max ~120 tekens). Geen hashtags, geen links.`;

  return [
    L ? `Language: English.` : `Taal: Nederlands.`,
    sline, season, names, ask
  ].filter(Boolean).join(" ");
}

async function callLLM(prompt){
  // Pseudo: vervang door jouw call (OpenAI responses, etc.)
  // return await openai.responses.create({ ... })
  return prompt; // placeholder tijdens dev → zie dat dataflow werkt
}

function sanitize(s){
  const oneLine = String(s || "").replace(/\s+/g, " ").trim();
  // Knip hard af op ~160 tekens als extra guard:
  return oneLine.slice(0, 160);
}

function chooseIcon({ sentiments, day }){
  if (day === "valentine") return "💌";
  if (day === "newyear")   return "🎆";
  if (day === "easter")    return "🐣";
  // simpele mapping (pas aan op jullie iconset):
  if (sentiments?.includes("liefde") || sentiments?.includes("love")) return "💛";
  if (sentiments?.includes("kalmte") || sentiments?.includes("calm")) return "🌿";
  if (sentiments?.includes("trots")  || sentiments?.includes("proud"))return "📯";
  return "✨";
}

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log("AI generator up on", PORT));