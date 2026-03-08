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

- **Never commit API keys or secrets** directly in source code.
- Use the placeholder system (`__GOOGLE_AI_API_KEY__`, `__FIREBASE_API_KEY__`) and inject secrets via environment variables at build time.
- Store secrets in [GitHub repository secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions), never in source files.
- Keep dependencies up to date (Dependabot is enabled for this repository).
