# CodeLens

<p align="center">
  <strong>Code reviews with zero blind spots</strong>
</p>

<p align="center">
  <a href="https://codelens-app.vercel.app">
    <img src="https://img.shields.io/badge/Try%20Demo-Live%20Link-blue?style=for-the-badge&logo=vercel" alt="Live Demo" />
  </a>
</p>

<p align="center">
  <img src="./public/landing.png" width="100%" alt="CodeLens Landing" />
  <img src="./public/dashboard.png" width="49.5%" alt="CodeLens Dashboard" />
  <img src="./public/demo.png" width="49.5%" alt="CodeLens Demo" />
</p>

CodeLens is an AI-powered code review tool that automatically analyzes pull requests line-by-line to surface bugs, performance issues, and architectural smells—instantly. Built for teams that move fast and care about code quality.

## AI Reviews in Action

<p align="center">
  <img src="./public/review%20left.png" width="49.5%" alt="Review Left" />
  <img src="./public/review%20right.png" width="49.5%" alt="Review Right" />
</p>




##  Features

- **Automatic PR Reviews**: Every pull request gets automatically reviewed on commit
- **Multi-Agent Verification**: Three independent AI defense agents vote to eliminate false positives
- **Autonomous Auto-Fix**: A ReAct agent investigates bugs and posts drop-in replacement GitHub suggestion blocks
- **Graph-Augmented Intelligence**: Parses ASTs (Tree-sitter) into PostgreSQL to map blast radius and dependencies
- **Split-Brain AI Routing**: Routes fast bulk scans to cheap models (Groq) and complex fixes to frontier models (Vertex Pro) with 4-layer failovers
- **Agent Trace Timeline**: Fully transparent dashboard to trace the AI's step-by-step reasoning and token usage
- **GitHub Integration**: Zero setup - works seamlessly with your GitHub repositories
- **Subscription Management**: Integrated with Polar for subscription handling

##  Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Language**: TypeScript
- **UI**: React 19, Tailwind CSS, Shadcn UI
- **Authentication**: [Better Auth](https://www.better-auth.com/) with GitHub OAuth
- **Database**: PostgreSQL with [Prisma](https://www.prisma.io/) (storing both relational data and AST graphs)
- **AI**: Multi-Provider via Vercel AI SDK (Google Vertex AI, Google Studio, OpenAI, Groq)
- **Code Parsing**: `web-tree-sitter` for multi-language AST symbol extraction
- **Vector Database**: [Pinecone](https://www.pinecone.io/) for RAG
- **Background Jobs**: [Inngest](https://www.inngest.com/)
- **Subscriptions**: [Polar](https://polar.sh/)
- **State Management**: TanStack Query (React Query)
- **Charts**: Recharts
- **Icons**: Lucide React

##  Prerequisites

- Node.js 18+ or Bun
- PostgreSQL database
- GitHub OAuth App
- Google AI API key (for Gemini)
- Pinecone account (for vector storage)
- Polar account (for subscriptions)
- Inngest account (for background jobs)

##  Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Arnab-iitkgp/codelens.git
cd codelens
```

### 2. Install dependencies

```bash
bun install
# or
npm install
```

### 3. Set up environment variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/codelens"

# Better Auth
BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_SECRET="your-secret-key"

# GitHub OAuth
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# Google AI (Gemini)
GOOGLE_GENERATIVE_AI_API_KEY="your-google-ai-api-key"

# Pinecone
PINECONE_API_KEY="your-pinecone-api-key"
PINECONE_INDEX_NAME="your-index-name"

# Polar
POLAR_ACCESS_TOKEN="your-polar-access-token"
POLAR_WEBHOOK_SECRET="your-polar-webhook-secret"
POLAR_SUCCESS_URL="http://localhost:3000/dashboard/subscription?success=true"

# Inngest
INNGEST_EVENT_KEY="your-inngest-event-key"
INNGEST_SIGNING_KEY="your-inngest-signing-key"

# App
NEXT_PUBLIC_APP_BASE_URL="http://localhost:3000"
```

### 4. Set up the database

```bash
# Generate Prisma client
bun run postinstall
# or
npx prisma generate

# Run migrations
bunx prisma migrate dev
# or
npx prisma migrate dev

```

### 5. Run the development server

```bash
bun run dev
# or
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.


##  Key Features Explained


### Graph-Augmented Code Intelligence
Unlike standard RAG that blindly searches vector blobs, CodeLens parses your repository into a deterministic Abstract Syntax Tree (AST) using `web-tree-sitter`. It extracts Symbols (functions, classes) and Edges (callers, callees) into PostgreSQL. When a PR alters a function, the agent instantly knows the exact "Blast Radius" of files that depend on it.

### Multi-Agent Verification Pipeline
To guarantee high signal-to-noise ratio, CodeLens employs a Multi-Agent architecture:
1. **The Investigator**: Deterministically traverses the Code Graph to gather PR context.
2. **The Prosecutor**: Scans the PR and proposes initial bug findings.
3. **The Defense (3x)**: Three independent AI critics (Correctness, Security, Runtime) vote to verify or refute the Prosecutor's claims. Only findings that pass a strict majority vote survive.
4. **The Judge**: Posts the final verified findings to GitHub.

### Autonomous Agentic Auto-Fix
Instead of just pointing out errors, CodeLens can fix them. Authorized repository owners can trigger the **Auto-Fix Agent** via the dashboard or by commenting `@codelens fix` on a GitHub PR thread.
Powered by a 10-step ReAct loop and Frontier models (e.g., Vertex AI Pro), the agent:
1. Reads the file and navigates the AST Graph.
2. Writes out its root-cause reasoning.
3. Generates a pristine, structurally-sound drop-in patch, posted directly as a GitHub `suggestion` block.

### Split-Brain Provider Routing
CodeLens natively supports routing different workloads to different LLM providers using strict `door:model` chains (e.g., `AI_REVIEW_CHAIN`, `AI_AGENT_CHAIN`). 
- Fast, bulk PR scanning is routed to high-speed models (like Groq or Gemini Flash).
- Complex, single-file autonomous fixing is routed to Frontier models (like Vertex AI Gemini Pro).
Every layer features zero-downtime, circuit-breaker failovers to guarantee enterprise reliability.

### Background Processing
Inngest handles asynchronous tasks like:
- Processing PR reviews
- Rebuilding AST Graphs and Vector Indexes
- Updating subscription status

## 🚀 Performance Optimizations

### High-Speed Repository Indexing
CodeLens implements a highly optimized repository indexing pipeline to minimize onboarding latency. 

| Metric | Sequential (Baseline) | Parallel (Optimized) | Improvement |
| :--- | :--- | :--- | :--- |
| **File Fetching** | ~25,000ms | **~1,700ms** | **14.7x faster** |
| **AI Embedding** | ~18,000ms | **~12,000ms** | **1.5x faster** |
| **Total Time** | ~43s | **~14s** | **3.1x faster** |

![Indexing Performance Comparison](./public/performance-comparison.png)

#### Key Technical Advancements:
- **Sequential AI Fallback Layer**: Architected a provider-agnostic AI abstraction layer utilizing a sequential fallback strategy, ensuring zero-downtime and automated request rerouting across Gemini, OpenAI, and Groq during API degradation.
- **Event-Driven Idempotency**: Configured Inngest to filter duplicate GitHub webhooks and dynamically cancel outdated AI tasks upon new commits, preventing redundant PR comments and wasted LLM token spend.
- **Git Trees API Architecture**: Replaced recursive directory traversal (`getContent` calls) with the Git Trees API, reducing repository structure discovery to a single network request.
- **Bounded Concurrency**: Replaced sequential O(N) file fetching with parallelized blob retrieval (`p-map` concurrency: 10). Parallelized embedding generation (concurrency: 5) ensures high throughput while preventing rate-limit throttling from GitHub and Gemini APIs.
- **Efficient Filtering**: Real-time filtering of non-code blobs and large binary assets during the fetching phase to reduce unnecessary AI processing costs.



##  Authentication

CodeLens uses Better Auth with GitHub OAuth. Users authenticate with their GitHub account, which also provides access to their repositories.

##  Database Schema

The main models include:
- **User**: User accounts with subscription info
- **Repository**: Connected GitHub repositories
- **Review**: Code review records
- **UserUsage**: Usage tracking for subscriptions

See [`prisma/schema.prisma`](./prisma/schema.prisma) for the complete schema.

##  Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request 

##  License

This project is private and proprietary.

##  Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- UI components from [Shadcn UI](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)
- AI powered by [Google Gemini](https://ai.google.dev/)

---

**Built for engineers who care about correctness, not noise.**
