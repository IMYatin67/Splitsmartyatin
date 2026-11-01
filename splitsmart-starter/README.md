# SplitSmart

SplitSmart turns natural-language expense descriptions into entries with a name,
amount, and payer. Groups and expenses are stored in Supabase; Gemini parses
expense descriptions.

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

3. Create `.env.local` from `.env.example` and set your Gemini and Supabase values:

   ```env
   GEMINI_API_KEY=your_api_key
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_key
   ```

4. In Supabase, enable **Anonymous Sign-Ins** under Authentication providers.

5. In the Supabase SQL Editor, run `supabase/schema.sql`, then
   `supabase/schema_hour6.sql` to create the expense, group, membership, and
   access policies.

6. Start the development server:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

The email entered in the app labels a password-free demo session; it is not a
verified Supabase email account. With Anonymous Sign-Ins enabled, each browser
gets its own Supabase identity, and groups can be shared by join code. If that
provider is disabled, the app falls back to browser-local groups; those groups
are only available in the same browser and do not sync across devices.

## Deploy to Vercel

1. Import `IMYatin67/Splitsmartyatin` into [Vercel](https://vercel.com/new).
2. Set the project **Root Directory** to `splitsmart-starter`.
3. Add `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` under the project's environment variables.
4. Enable Anonymous Sign-Ins and run both Supabase SQL scripts as described above.
5. Deploy. Future pushes to `main` will trigger deployments.

Never commit `.env.local` or expose the Gemini key in a `NEXT_PUBLIC_` variable.
