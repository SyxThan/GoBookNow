// Loaded before Nest, HTTP adapters and business modules.
import { initializeSentry } from './observability/sentry.js';
initializeSentry();
