import dotenv from "dotenv";
import path from "path";
// Set up environment before importing gemini.ts
const envPath = path.resolve('c:/Users/muham/Downloads/FYP Copy/ai-therapist-agent-backend-main/ai-therapist-agent-backend-main/.env');
dotenv.config({ path: envPath });

import { generateTextContent, DEFAULT_MODEL } from "./src/utils/gemini";

async function runVerification() {
    console.log(`Starting verification test with model: ${DEFAULT_MODEL}`);
    console.log(`Keys configured: ${!!process.env.GEMINI_API_KEY}, ${!!process.env.GEMINI_API_KEY_2}, ${!!process.env.GEMINI_API_KEY_3}`);

    try {
        const response = await generateTextContent("Say 'AI is working!'", "Fallback");
        console.log(`AI Response: ${response}`);
        if (response.includes("AI is working")) {
            console.log("VERIFICATION SUCCESSFUL!");
        } else if (response.includes("High demand")) {
            console.log("VERIFICATION PARTIAL: Hit circuit breaker/high demand, but handled gracefully.");
        } else {
            console.log("VERIFICATION FAILED: Unexpected response.");
        }
    } catch (error) {
        console.error("VERIFICATION FAILED with error:", error.message);
    }
}

runVerification();
