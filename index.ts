import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { generateObject, generateText, stepCountIs, tool } from "ai";
import "dotenv/config";
import z from "zod";
import { Exa } from "exa-js";
import fs from "fs";

// const mainModel = openai("gpt-4o-mini");
const mainModel = google("gemini-2.5-flash");

const exa = new Exa(process.env.EXA_API_KEY);

type SearchResult = {
  title: string;
  url: string;
  content: string;
};

const searchWeb = async (query: string) => {
  const { results } = await exa.searchAndContents(query, {
    numResults: 1,
    livecrawl: "always",
  });

  return results.map((result) => ({
    title: result.title,
    url: result.url,
    content: result.text,
  })) as SearchResult[];
};

const generateSearchQuery = async (query: string, n: number = 3) => {
  const {
    object: { queries },
  } = await generateObject({
    model: mainModel,
    prompt: `Generate ${n} search queries for the following query: ${query}`,
    schema: z.object({
      queries: z.array(z.string()).min(1).max(5),
    }),
  });

  return queries;
};

const searchAndProcess = async (
  query: string,
  accumulatedSources: SearchResult[]
) => {
  const pendingSearchResults: SearchResult[] = [];
  const finalSearchResults: SearchResult[] = [];

  await generateText({
    model: mainModel,
    prompt: `Search the web for information about: ${query}.`,
    system:
      "You are a research. For each query, search the web and then evaluate if the results are relevant and will help you answer the query.",

    tools: {
      searchWeb: tool({
        description: "Search the web for information about the query.",
        inputSchema: z.object({
          query: z.string().min(3),
        }),
        async execute({ query }) {
          const results = await searchWeb(query);
          pendingSearchResults.push(...results);

          return `Found ${results.length} search results for: ${query}`;
        },
      }),
      evaluate: tool({
        description: "Evaluate the search results.",
        inputSchema: z.object({}),
        async execute() {
          const pandingResult = pendingSearchResults.pop()!;
          const { object: evaluation } = await generateObject({
            model: mainModel,
            prompt: `Evaluate whether the search results are relevant and will help answer the following query: ${query}. if the page already exists in the existing results, mark it as irrelevant.
            
            <search_results>
            ${JSON.stringify(pandingResult)}
            </search_results>

            <existing_results>
            ${JSON.stringify(accumulatedSources.map((r) => r.url))}
            </existing_results>
            `,
            output: "enum",
            enum: ["relevant", "irrelevant"],
          });

          if (evaluation === "relevant") {
            finalSearchResults.push(pandingResult);
          }

          console.log("Found", pandingResult.url);
          console.log("Evaluation: =>", evaluation);

          return evaluation === "irrelevant"
            ? "Search results are irrelevant, search again with a more specific query."
            : "Search results are relevant, End research for this query.";
        },
      }),
    },

    stopWhen: stepCountIs(5),
  });

  return finalSearchResults;
};

const generateLearnings = async (query: string, results: SearchResult) => {
  const { object } = await generateObject({
    model: mainModel,
    prompt: `The user is researching "${query}". the following search results were deemed relevant. Generate a learning and a follow-up question from the following search results:

    <search_results>
    ${JSON.stringify(results)}
    </search_results>
    `,
    schema: z.object({
      learning: z.string().min(10),
      followUpQuestions: z.array(z.string()),
    }),
  });

  return object;
};

type Learning = {
  learning: string;
  followUpQuestions: string[];
};

type Research = {
  query: string | undefined;
  queries: string[];
  searchResults: SearchResult[];
  learnings: Learning[];
  completedQueries: string[];
};

const accumulatedResearch: Research = {
  query: undefined,
  queries: [],
  searchResults: [],
  learnings: [],
  completedQueries: [],
};

const deepResearch = async (
  prompt: string,
  depth: number = 2,
  breadth: number = 3
) => {
  if (!accumulatedResearch.query) {
    accumulatedResearch.query = prompt;
  }

  if (depth === 0) {
    return accumulatedResearch;
  }

  const queries = await generateSearchQuery(prompt, breadth);
  accumulatedResearch.queries = queries;

  for (const query of queries) {
    console.log("Searching for:", query);

    const results = await searchAndProcess(
      query,
      accumulatedResearch.searchResults
    );
    accumulatedResearch.searchResults.push(...results);
    for (const result of results) {
      const learning = await generateLearnings(query, result);
      accumulatedResearch.learnings.push(learning);
      accumulatedResearch.completedQueries.push(query);

      const newQuery = `Overall research goal: ${prompt}
      Previous search queries: ${accumulatedResearch.queries.join(", ")}

      Follow-up question: ${learning.followUpQuestions.join(", ")}
      `;

      await deepResearch(newQuery, depth - 1, Math.ceil(breadth / 2));
    }
  }

  return accumulatedResearch;
};

const SYSTEM_PROMPT = `
- You are an expert researcher. Today is ${new Date().toISOString()}. Follow these instructions.
- The user is a highly experienced analyst, no need to simplify it, be as detailed as possible.
- Be highly organized.
- Suggest solutions that I didn't think about.
- Be proactive and anticipate my needs.
- Treat me as an expert in all subject matter.
- Mistakes erode my trust, so be accurate and thorough.
- Provide detailed explanations, I'm comfortable with lots of detail.
- Value good arguments over authorities, the source is irrelevant.
- Consider new technologies and contrarian ideas, not just the conventional wisdom.
- You may use high levels of speculation or prediction, just flag it for me.
- Use Markdown formatting.
- Before answering, break down complex requests into a sequence of logical steps.
- Synthesize findings from multiple sources into a coherent analysis, don't just list information.
- Acknowledge when you don't know something or when information is unavailable.
- For complex research, begin with a concise executive summary.
`;

const generateReport = async (research: Research) => {
  const { text } = await generateText({
    model: google("gemini-2.5-pro"),
    // model: openai("gpt-5"),
    system: SYSTEM_PROMPT,
    prompt: `Generate a report based on the following research data:
    <research>
    ${JSON.stringify(research, null, 2)}
    </research>
    `,
  });

  return text;
};

const main = async () => {
  const prompt = "the last events in 2025";

  const research = await deepResearch(prompt);

  const report = await generateReport(research);
  console.log("Report generated! report.md");

  fs.writeFileSync("report.md", report);
};

main();
