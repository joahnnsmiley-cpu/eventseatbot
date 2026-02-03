import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY not set via process.env.API_KEY");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const generateEventDescription = async (title: string, tableCount: number): Promise<string> => {
  const client = getClient();
  if (!client) return "Please set your API Key to use AI features.";

  try {
    const prompt = `Write a short, exciting marketing description (max 2 sentences) for an event named "${title}". The venue has ${tableCount} tables available. Mention that seats are limited. Tone: Professional but inviting.`;
    
    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "Join us for an amazing event!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Join us for an amazing event! (AI generation failed)";
  }
};