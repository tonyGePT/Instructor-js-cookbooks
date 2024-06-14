import { z } from "zod";
import Instructor from "@instructor-ai/instructor";
import OpenAI from "openai";

const oai = new OpenAI({
  apiKey: Bun.env.OPENAI_API_KEY ?? undefined,
  organization: Bun.env.OPENAI_ORG_ID ?? undefined,
});

const client = Instructor({
  client: oai,
  mode: "TOOLS",
});

// Define the schema for the reasoning object
const ReasoningAnswerSchema = z.object({
  reasoning: z.string(),
  answer: z.string(),
});

// Define the data type for the reasoning and answer object
type ReasoningAnswer = z.infer<typeof ReasoningAnswerSchema>;

// Function to dynamically create a sub-questions schema
function createSubQuestionsSchema(numSubQuestions: number) {
  const subQuestionsShape: Record<string, z.ZodString> = {};
  for (let i = 1; i <= numSubQuestions; i++) {
    subQuestionsShape[`subQ${i}`] = z.string();
  }
  return z.object(subQuestionsShape);
}

// Function to decompose the user query into sub-questions
async function decomposeQuery(query: string, numSubQuestions: number): Promise<Record<string, string>> {
  const SubQuestionsSchema = createSubQuestionsSchema(numSubQuestions);
  const decompositionPrompt = `Decompose the following query into ${numSubQuestions} sub-questions: ${query}`;
  
  console.log(`\nDecomposition Prompt:\n${decompositionPrompt}\n`);

  const subQuestionsResponse = await client.chat.completions.create({
    messages: [{ role: "user", content: decompositionPrompt }],
    model: "gpt-4o",
    response_model: {
      schema: SubQuestionsSchema,
      name: "sub_questions",
    },
  });

  console.log(`Sub-Questions Response:\n${JSON.stringify(subQuestionsResponse['sub_questions'], null, 2)}\n`);

  return SubQuestionsSchema.parse(subQuestionsResponse);
}

// Function to query the language model for each sub-question and build the reasoning object
async function getReasoningAndAnswer(subQuestions: Record<string, string>): Promise<ReasoningAnswer> {
  let reasoning = '';
  let answer = '';

  for (const subQuestion of Object.values(subQuestions)) {
    const reasoningPrompt = `Question: ${subQuestion}\nPrevious Reasoning: ${reasoning}\nAnswer: ${answer}\nProvide reasoning and answer for the current question.`;
    
    console.log(`\nReasoning Prompt:\n${reasoningPrompt}\n`);

    const reasoningAnswerResponse = await client.chat.completions.create({
      messages: [{ role: "user", content: reasoningPrompt }],
      model: "gpt-4o",
      response_model: {
        schema: ReasoningAnswerSchema,
        name: "reasoning_answer",
      },
    });

    console.log(`Reasoning: ${reasoningAnswerResponse.reasoning}\nAnswer: ${reasoningAnswerResponse.answer}\n`);

    reasoning += reasoningAnswerResponse.reasoning + ' ';
    answer = reasoningAnswerResponse.answer;
  }

  return { reasoning, answer };
}

// Main function to handle the user query
async function handleUserQuery(query: string, subQs: number): Promise<ReasoningAnswer> {
  // Step 1: Decompose the query into sub-questions
  console.log(`\nHandling User Query:\n${query}\n`);
  
  const subQuestions = await decomposeQuery(query, subQs);

  // Step 2: Get reasoning and answers for each sub-question
  const finalReasoningAnswer = await getReasoningAndAnswer(subQuestions);

  console.log(`\nFinal Reasoning:\n${finalReasoningAnswer.reasoning}\n`);
  console.log(`Final Answer:\n${finalReasoningAnswer.answer}\n`);
  
  return finalReasoningAnswer;
}

// Example usage
(async () => {
  const userQuery = "How do I get Jason's attention with this code I'm writing? For context he wrote a tweet asking for some work done in exchange for a bounty reward and some freelance work refs.";
  
  const result = await handleUserQuery(userQuery, 3);
})();
