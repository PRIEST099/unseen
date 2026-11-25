Workspace: `D:\kiroween 2026\night-shift`. Small, focused fix. Save after each step. Never end with a menu or a question. The hard rules from 49e still apply: never approve anything in Crew, never call approval, trust or enable endpoints, never uninstall, never touch `../the-unseen`.

## The bug (the owner saw it in the Crew dashboard)
Opening "Morning report" shows:
> Failed to load Night Shift Crew: The requested module '@kirocrew/app-sdk' does not provide an export named 'defineApp'

`ui/src/index.tsx` imports `defineApp` and exports `defineApp({pages: [...]})`. That API does not exist.

## The real contract (from Crew 0.13.1 on this machine; read these, do not guess)
- **The SDK's real types:** `C:\Program Files\KiroCrew\resources\backend-dist\kirocrew-backend\Lib\site-packages\kiro_crew\static\dist\vendor\kirocrew-app-sdk.d.ts`. The exports are hooks and providers: `useAppApi`, `useTheme`, `useAppInfo`, `useNavigate`, `useNotify`, `useNavBadge`, `useChatLauncher`, `useAppEvents` and so on. **There is no `defineApp`.**
- **A shipped app shows the page contract:** `%USERPROFILE%\.kiro\crew\apps\file-explorer\`.
  - Its `app.json` `ui` is `{"entry": "dist/index.mjs", "pages": [{"route": "/apps/file-explorer", "label": "Files"}]}`.
  - Its built `ui/dist/index.mjs` ends with `export { FileExplorerApp as default }`. **The entry's default export is a React component.**
  - It imports only from host-provided modules: `@kirocrew/app-sdk`, `@kirocrew/app-sdk/ui`, `react`, `react-dom`, `react/jsx-runtime`, `lucide-react` and `@tanstack/react-query`.

## Fix
1. Make `ui/src/index.tsx` default-export the `MorningReport` component. Use only real SDK exports, for example `useTheme`, if useful at all.
   - Type the SDK with a minimal local `declare module '@kirocrew/app-sdk'` covering only the members you use, copied from that `.d.ts`. Do not vendor the whole file.
2. Rebuild `ui/dist/` and commit it.
3. Add a test that reads the built `ui/dist/index.mjs` and checks three things:
   - It has a default export.
   - It imports nothing outside the host-provided list above.
   - It does not contain `defineApp`.
4. Run the unit tests and the typecheck.
5. Do not install or update the app in Crew. The owner will press Update in the dashboard.

Finish with `Next: owner presses Update on the Night Shift app page`.
