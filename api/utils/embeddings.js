import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || process.env.FREE_GEMINI_KEY;
if (!apiKey) {
  console.warn('GEMINI_API_KEY is not set. Embedding generation will fail.');
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

export async function generateEmbedding(text) {
  if (!text || typeof text !== 'string') return null;
  
  // Clean text and truncate if necessary (Gemini has a limit, but it's high)
  const cleanText = text.trim().slice(0, 9000); // Safety limit

  try {
    const result = await model.embedContent(cleanText);
    return result.embedding.values;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}
