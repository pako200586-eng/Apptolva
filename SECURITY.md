# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please **do not** open a public issue.

Instead, report it privately by contacting the repository owner directly through GitHub.

We will acknowledge your report within 48 hours and work to address confirmed vulnerabilities as quickly as possible.

## Security Best Practices for Contributors

- The Netlify `cerrar-fallas-repetidas` function requires `FIREBASE_SERVICE_ACCOUNT_JSON`, containing the Firebase service-account JSON with Firestore access. Configure it as a Netlify environment variable; never commit the JSON or place it in the PWA. Use the staging service account for Branch deploys and Deploy Previews and the production one only for the Production context; the function rejects ID tokens from another Firebase project.
- The retroactive bulk cleanup ("Depurar fallas repetidas"), the Firestore storage audit and the Firestore JSON backup only run for the emails listed in `DEPURACION_MASIVA_EMAILS` (comma-separated; empty means nobody). The audit and backup read through the Netlify function (`firestore-page`), and the buttons stay hidden for everyone else. The cleanup is also limited to once every `DEPURACION_INTERVALO_DIAS` days (default 30), tracked in `control_depuracion/retroactiva`.
- Netlify's `CONTEXT` is embedded at build time: any context other than `production` makes the PWA use the staging Firebase project.
- Firebase web configuration (including its API key) is public client configuration, not an authorization secret. Provide the staging and production JSON objects through the `FIREBASE_STAGING_CONFIG_JSON` and `FIREBASE_PRODUCTION_CONFIG_JSON` Netlify build environment variables; never commit them to source.
- Each value must be the Web App config JSON from its corresponding Firebase project, with `apiKey`, `authDomain`, `projectId`, `messagingSenderId`, and `appId`; `storageBucket` and `measurementId` are optional.
- **Never commit service-account credentials or other server secrets** directly in source code.
- The app selects staging for localhost, Netlify deploy previews, and hostnames containing `staging`; other hostnames use production. Configure both JSON objects in every Netlify deploy context that builds this site.
- Store secrets in [GitHub repository secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions), never in source files.
- Keep dependencies up to date (Dependabot is enabled for this repository).
