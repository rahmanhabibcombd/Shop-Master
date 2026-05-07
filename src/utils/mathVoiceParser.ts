import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  if (!aiInstance) {
    if (!process.env.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY is missing. Voice AI math fallback to standard parsing.");
      return null;
    }
    aiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiInstance;
};

export const parseMathVoiceCommandAI = async (rawText: string): Promise<string | null> => {
  const ai = getAI();
  if (!ai) return null;

  const prompt = `
You are an expert math voice assistant. The user is dictating a mathematical calculation.
Your ONLY output MUST be the resulting mathematical expression (e.g., 10+20-5*2).

Rules:
1. Extract numbers and operators ONLY.
2. Ignore all conversational filler (e.g., "please", "calculate", "how much", language greetings).
3. If the user repeats numbers, discard the repetition and keep only the intended final expression.
4. If the user makes a statement (e.g., "10 plus 10"), return "10+10". 
5. NEVER add filler text or explanations to the output.
6. Return "ERROR" if no valid math expression can be formed.

Operator Mapping:
- যোগ, plus, add -> +
- বিয়োগ, minus, subtract, বাদ দাও -> -
- গুণ, times, multiply, ইনটু -> *
- ভাগ, divide, করো -> /
- শতাংশ, percent -> /100*

Transcript: "${rawText.replace(/"/g, "'")}"
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        temperature: 0,
        maxOutputTokens: 64,
      }
    });

    if (response && response.text) {
      const result = response.text.trim();
      return result === "ERROR" ? null : result;
    }
  } catch (error: any) {
    console.error("AI parse math voice command failed:", error);
  }
  return null;
};
