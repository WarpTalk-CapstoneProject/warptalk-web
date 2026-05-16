# WarpTalk Web

Welcome to the **WarpTalk Web** application repository. This project is a modern web application built with [Next.js](https://nextjs.org/) to provide real-time communication and interpretation for global teams.

## 🚀 Tech Stack

This project utilizes the following technologies:

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **UI Library:** [React 19](https://react.dev/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Component Library:** [Shadcn UI](https://ui.shadcn.com/) & [@base-ui/react](https://base-ui.com/)
- **State Management:** [Zustand](https://zustand-demo.pmnd.rs/)
- **Data Fetching:** [React Query (@tanstack/react-query)](https://tanstack.com/query/latest) & [Axios](https://axios-http.com/)
- **Real-time Communication:** [SignalR (@microsoft/signalr)](https://learn.microsoft.com/en-us/aspnet/core/signalr/introduction)
- **Authentication:** [NextAuth.js](https://next-auth.js.org/)
- **Forms & Validation:** [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/)
- **Animations:** [tw-animate-css](https://github.com/pheralb/tw-animate-css)

## 📂 Project Structure

Below is an overview of the directory structure to help developers navigate the codebase easily:

```text
warptalk-web/
├── .agents/               # Documentation, rules, and skills for AI agents (page-docs, etc.)
├── .gemini/               # Configuration and commands for the AI coding assistant
├── public/                # Static assets (images, icons, etc.)
├── src/
│   ├── app/               # Next.js App Router (pages, layouts, globals.css)
│   ├── components/        # Reusable React components
│   │   ├── landing/       # Components specific to the landing page (e.g., HeroSection, GlassOverlay)
│   │   ├── layout/        # Shared layout components (headers, footers)
│   │   └── ui/            # Generic/Shadcn UI components (buttons, inputs, etc.)
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utility functions and configurations
│   ├── services/          # API integrations and external services (e.g., API clients)
│   ├── stores/            # Zustand global state stores
│   ├── types/             # TypeScript type definitions and interfaces
│   └── middleware.ts      # Next.js middleware (e.g., for routing and authentication checks)
├── next.config.ts         # Next.js configuration
├── package.json           # Dependencies and project scripts
├── tailwind.config.ts     # Tailwind CSS configuration (if applicable)
└── README.md              # This documentation file
```

## 🛠️ Getting Started

Follow these steps to set up the project locally.

### 1. Installation

Ensure you have Node.js installed, then install the dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 2. Development Server

Start the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application running. The page will auto-update as you modify files in the `src/` directory.

### 3. Building for Production

To create an optimized production build:

```bash
npm run build
```

To start the production server:

```bash
npm start
```

## 🤖 AI Agents & Documentation

This project uses an AI-assisted workflow. 

- Before making changes, please review the rules in `.agents/rules/continuous-workflow-rule.md`.
- Documentation regarding pages, features, and UI interactions (like the Landing Page animations) is kept updated in the `.agents/page-docs/` folder.
- **Rule of thumb:** Any structural or UI logic changes should be documented in the corresponding markdown files under `.agents/page-docs/`.

## 🌐 Deployment

The easiest way to deploy this Next.js app is to use the [Vercel Platform](https://vercel.com/new). Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
