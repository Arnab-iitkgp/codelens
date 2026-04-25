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
- **AI-Powered Analysis**: Uses Google Gemini to understand context, not just syntax
- **Line-by-Line Analysis**: Catches bugs, security issues, and risky patterns you might miss
- **GitHub Integration**: Zero setup - works seamlessly with your GitHub repositories
- **Context-Aware Insights**: Uses RAG (Retrieval-Augmented Generation) for better code understanding
- **Subscription Management**: Integrated with Polar for subscription handling
- **Real-time Dashboard**: Track your repositories, reviews, and activity

##  Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Language**: TypeScript
- **UI**: React 19, Tailwind CSS, Shadcn UI
- **Authentication**: [Better Auth](https://www.better-auth.com/) with GitHub OAuth
- **Database**: PostgreSQL with [Prisma](https://www.prisma.io/)
- **AI**: [Google Gemini 2.5 Flash](https://ai.google.dev/) via Vercel AI SDK
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


### Automatic Code Reviews

When a pull request is opened, CodeLens:
1. Fetches the PR diff from GitHub
2. Retrieves relevant context from your codebase using RAG
3. Analyzes the code using Google Gemini AI
4. Posts detailed review comments directly on the PR

### RAG (Retrieval-Augmented Generation)

CodeLens uses Pinecone to store and retrieve code embeddings, allowing the AI to understand your codebase context when reviewing PRs.

### Background Processing

Inngest handles asynchronous tasks like:
- Processing PR reviews
- Syncing repository data
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
- **Git Trees API Architecture**: Replaced recursive `getContent` calls (O(N) network requests) with the Git Trees API to retrieve the entire repository structure in a single O(1) request.
- **Bounded Concurrency**: Implemented `p-map` for parallel blob fetching (concurrency: 10) and embedding generation (concurrency: 5), ensuring high throughput while staying within GitHub and Gemini API rate limits.
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
