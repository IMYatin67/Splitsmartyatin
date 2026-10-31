# SplitSmart

SplitSmart turns natural-language expense descriptions into entries with a name,
amount, and payer. It uses Next.js, Google Gemini, and browser `localStorage`.

## Run locally

1. Clone this repository and open the app folder:

   ```bash
   git clone https://github.com/IMYatin67/Splitsmartyatin.git
   cd Splitsmartyatin/splitsmart-starter
   ```

2. Install dependencies:

   ```bash
   npm ci
   ```

3. Create `.env.local` from `.env.example` and set your Google AI Studio key:

   ```env
   GEMINI_API_KEY=your_api_key
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Import `IMYatin67/Splitsmartyatin` into [Vercel](https://vercel.com/new).
2. Set the project **Root Directory** to `splitsmart-starter`.
3. Add `GEMINI_API_KEY` under the project's environment variables.
4. Deploy. Future pushes to `main` will trigger deployments.

Never commit `.env.local` or expose the Gemini key in a `NEXT_PUBLIC_` variable.

Expenses are currently saved in each browser's localStorage; they are not shared
between users or devices.
