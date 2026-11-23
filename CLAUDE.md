# CLAUDE.md: Skyline

You are building "Skyline", a Reddit Devvit Web game with three.js. Follow docs/SKYLINE_PLAN.md.

## Absolute rules
1. Work ONE phase at a time. Never start work from a later phase. At the end of each phase run
   the acceptance checklist and print PASS/FAIL per item. Fix failures before stopping.
2. TypeScript strict mode everywhere. No `any`, no `@ts-ignore`, no non-null `!` unless justified
   in a comment. No unused code, no TODO stubs, no placeholder data in production paths.
3. Game rules live ONLY in `src/shared/` as pure functions with no DOM, no three.js, no Devvit
   imports. Client and server both import them. The server re-simulates every submitted run with
   these same functions. Never duplicate rule logic in the client or the server.
4. No external network access from the client. No CDN links, no remote fonts/images/audio.
   All assets are bundled or generated in code (procedural textures, synthesized audio).
5. Verify Devvit APIs against the official docs/types before using them
   (https://developers.reddit.com/docs). If an API name or field is uncertain, read the installed
   type definitions in node_modules/@devvit/*. NEVER guess a field name.
6. Never log secrets. Never render raw HTML from post titles. Titles are untrusted text:
   draw them via canvas fillText or textContent only, never innerHTML.
7. Exclude NSFW, spoiler, removed, deleted and stickied posts from the city. Truncate titles to
   60 chars. Strip control characters. Run a basic profanity-mask on rendered titles.
8. Performance budget is a hard requirement (Section 7.6). Dispose every geometry, material and
   texture you create. No per-frame allocations in the render loop.
9. Run `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build` before declaring
   any phase done. Paste their results.
10. Do not add dependencies beyond those listed in the plan without asking. Do not edit files
    outside the `skyline/` folder.
11. Keep commits small. One commit per completed task with a clear message.
12. If a requirement is ambiguous, ask a question BEFORE coding. Do not invent requirements.
13. Contest rules (plan Section 0.5) are requirements. Never run `devvit publish`; use upload and playtest only.
14. User-facing copy never contains the words karma, upvote, subreddit, Snoo. Use "Buzz" (score), "Chatter" (comments) and "community".
15. The UI must fit the viewport with zero page scroll from 360x640 up to 1920x1080 (use 100dvh and safe-area insets).
    No generic default-styled controls. Every control uses the design tokens in plan Section 8.1.
16. Add Devvit Journeys events exactly as plan Section 5.8. Never put usernames or other personal data into event fields.

## Style
- Small modules, named exports, no default exports except where tools require them.
- Pure functions in shared/. Side effects only at the edges (server routes, scene, DOM).
- Comments explain WHY, not WHAT.
