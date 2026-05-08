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
You are an expert math voice assistant for a calculator app.
The user speaks in Bengali, English, or a mix of both. 
Your task is to parse the voice transcript into a clean, single mathematical expression (e.g., 500+66700+800+600+300).

Operator Mapping:
- যোগ, plus, add -> +
- বিয়োগ, minus, subtract, বাদ দাও -> -
- গুণ, times, multiply, ইনটু -> *
- ভাগ, divide, করো -> /
- শতাংশ, percent -> /100*

Rules:
1. Extract ONLY the intended numbers and operators.
2. Ignore all conversational filler (e.g., "please", "calculate", "how much").
3. IF THE USER REPEATS NUMBERS OR PHRASES, ignore the repetition and output the intended calculation once.
4. Convert Bengali numerals/words to digits (e.g., "১০" -> 10).
5. Output ONLY the resulting math string. NO filler text/explanations.
6. Return "ERROR" if no valid math expression can be formed.

Transcript: "${rawText.replace(/"/g, "'")}"
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
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
