# Noodlyn

## Project info

**Website**: https://noodlyn.com

**Lovable project**: https://lovable.dev/projects/4523c14a-d949-4525-aba0-140756208667

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/4523c14a-d949-4525-aba0-140756208667) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

For local Google/Lovable sign-in, open `http://127.0.0.1:8080`. Vite forwards
`/~oauth/initiate` to this project's published Lovable app; the hosted OAuth
service then returns to the local app. Vite preview uses the same proxy.
In Lovable, **More → Users → Settings → Advanced → Redirect URLs** must include
`http://127.0.0.1:8080/**` (Lovable rejects `localhost` entries). The proxy intentionally keeps the original Lovable origin even though the public
website is now `https://noodlyn.com`.
The local app uses the same backend accounts and data as the published app.

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## iPad USB MIDI support (native wrapper)

Safari/PWA on iPadOS does not currently expose Web MIDI. This repo includes an iPad bridge/polyfill strategy for native wrappers (WKWebView/Capacitor).

See `docs/ipados-midi-bridge.md` for the integration contract and Swift sketch.
For full iMac→iPad packaging/testing steps, see `docs/ipad-rm.md`.

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/4523c14a-d949-4525-aba0-140756208667) and click on Share -> Publish.

The Python builder used by in-app tune uploads is deployed separately to **Modal**. Publishing the web app or pulling/pushing Git changes does not update it. See the [hosted tune builder runbook](tooling/tune_worker/README.md) for login, redeployment, backend configuration, retries, and troubleshooting.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Design systems

Run `npm run storybook` to browse the web component library at http://localhost:6006.
In **Noodlyn Learn**, tap **Design system** to open the native component gallery.
See [the design-system guide](docs/design-system.md) for tokens, components, testing and contribution rules.

## Branding and compatibility

The public product is **Noodlyn** at https://noodlyn.com; the standalone SwiftUI
app is **Noodlyn Learn**. The Capacitor and SwiftUI apps remain independent.

The rebrand preserves the Lovable project, backend, OAuth provider integration,
local OAuth proxy and native `ReplayWebURL` auth origins. Both native apps still
use the published Lovable `/auth/native` bridge. Moving that bridge to the custom
domain requires verifying Google/Lovable sign-in, email redirects, password reset
and both native callbacks first.

Bundle IDs, callback schemes, Keychain services, browser/native storage keys,
plugin names, Xcode schemes and the Modal worker name remain compatibility
identifiers. Keep these stable so existing installations retain access and data.
The playback action “Replay” is also unchanged. Historical design explorations
and performance reports retain their original names.
