# AI Web Research Agent

This project is an agent that generates search queries, performs web searches using the Exa API, and evaluates search results using an LLM (Google Gemini / OpenAI). It filters relevant results and displays them in the console.

## How It Works

- The agent generates multiple search queries from a user prompt.
- For each query, it searches the web and gathers results.
- It evaluates each result as either "relevant" or "irrelevant" using an LLM.
- The relevant results are collected and printed to the console.

## Installation & Run

1. Clone the repository (excluding the `node_modules` folder).
2. Open a terminal in the project folder and install dependencies:

   ```powershell
   npm install
   ```

3. Create a `.env` file in the project root with your API keys (e.g., `EXA_API_KEY`).
4. Run the agent:

   ```powershell
   npm start
   ```

The console will display the generated queries, search steps, and evaluation results.

## Security Note

Do not commit your API keys to version control.
