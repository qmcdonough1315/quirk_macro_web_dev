# Independent Gemini connection and commentary cleanup

## Outcome
- Remove the visible **“AI summary”** marker from Past Week Recap.
- Route all generated commentary directly to Google Gemini, without Lovable AI Gateway or a Lovable-managed AI key.
- Keep the existing `gemini-3.6-flash` model, caching behavior, and exact unavailable message.

## Changes
1. **Direct Google Gemini client**
   - Replace the Lovable AI Gateway request in the shared server-only AI helper with Google’s official Gemini REST endpoint.
   - Read a user-owned credential from the portable server environment variable `GEMINI_API_KEY`.
   - Translate the existing system/user message format into Gemini’s request format and normalize its text response for current callers.
   - Remove all use of `LOVABLE_API_KEY`, `ai.gateway.lovable.dev`, and Lovable AI request headers from generated commentary.

2. **Preserve every commentary feature**
   - Keep Drive-By Vibe, area profile, Past Week Recap, economic calendar, and ETF regime commentary on `gemini-3.6-flash`.
   - Preserve current JSON parsing, 6–24 hour caches, and UI behavior.
   - Continue showing exactly: “commentary unavailable at the moment, check back soon!” when Gemini is unavailable or returns unusable output.
   - Keep retries bounded to transient rate-limit/server failures; do not retry invalid credentials or requests.

3. **Presentation cleanup**
   - Remove only the “AI summary” badge from Past Week Recap while leaving its title and commentary layout unchanged.

4. **Credential setup and verification**
   - Open the secure secret form for a fresh `GEMINI_API_KEY`; do not reuse or store the key previously pasted into chat.
   - Test each generated-text path against Google’s endpoint, verify the fallback state, check phone and desktop presentation, and confirm the app builds cleanly.

## Portability
The app code will depend only on Google’s public Gemini API and the conventional `GEMINI_API_KEY` environment variable. The same code and user-owned key can be moved to another host without retaining a Lovable AI connection.
