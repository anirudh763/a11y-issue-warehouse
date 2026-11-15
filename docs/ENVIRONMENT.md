# Environment configuration

The static issue explorer does not load `.env` or read runtime environment variables. Local extraction and browser-test tools recognize `GITHUB_TOKEN` (optional private token for API access) and `WAREHOUSE_DB` (test database path). The root example leaves the token unset; never commit credentials.

An optional local n8n instance is separate; see [integrations/n8n/.env.example](../integrations/n8n/.env.example). It does not install, start, or connect a workflow.
