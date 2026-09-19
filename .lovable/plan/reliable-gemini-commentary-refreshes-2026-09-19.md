# Reliable Gemini commentary refreshes

## What is happening

The direct Gemini connection is currently working on both preview and the published site. The screenshot shows the app's intended fallback message from an earlier failed or empty response. That fallback is returned as ordinary successful data, so the browser can keep it until the recap query becomes stale instead of trying Gemini again promptly.

## Changes

1. **Use Eastern-time refresh windows**
   - Divide every day into three periods beginning at **6:00 AM, 12:00 PM, and 6:00 PM Eastern**.
   - Include the current Eastern date and period in commentary cache keys.
   - The first visitor after each boundary generates that period's fresh commentary; later visitors reuse it.
   - Calculate this with the `America/New_York` timezone so daylight-saving changes are handled correctly.

2. **Apply the schedule to generated commentary**
   - Past Week Recap.
   - ETF Model regime commentary.
   - ZIP/local-market commentary, scoped by location and current market inputs.
   - Keep the direct Google Gemini connection and `gemini-3.6-flash`; do not reintroduce Lovable AI routing.

3. **Do not let a temporary failure look cached and final**
   - Keep the exact fallback: “commentary unavailable at the moment, check back soon!”.
   - Cache only valid Gemini responses, never the fallback.
   - Return an explicit availability state from commentary requests so the page can distinguish generated text from a temporary failure.
   - Retry a failed/empty commentary request after a short delay or on the next visit, while continuing to avoid repeated retries for invalid credentials.

4. **Align browser caching with the refresh windows**
   - Add the current Eastern refresh period to the relevant query keys.
   - Keep successful commentary warm only until the next 6 AM, noon, or 6 PM boundary.
   - Automatically request the new period when a tab is opened after a boundary, without requiring a hard refresh.

5. **Verify**
   - Confirm the published Past Week Recap, ETF Model, and a ZIP commentary render generated text.
   - Simulate each Eastern-time boundary and confirm one fresh request per period while repeated visits reuse the result.
   - Simulate an unavailable response and confirm the fallback appears but does not remain cached for the whole period.
   - Check desktop and phone layouts, then confirm the app builds cleanly.
