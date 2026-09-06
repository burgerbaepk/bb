import { config } from 'dotenv';

/**
 * Load the developer environment before the suites decide whether to run.
 *
 * The constraint tests assert behaviour only Postgres can provide, so they need
 * a real database. Without one they skip rather than fail, which keeps CI green
 * without secrets — but that means the env has to be loaded before the guard is
 * evaluated, not lazily inside the client.
 */
config({ path: '../../.env.local', quiet: true });
config({ path: '../../.env', quiet: true });
