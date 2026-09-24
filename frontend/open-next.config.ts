import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// App entièrement dynamique (SPA cliente branchée sur l'API FastAPI) : pas
// d'ISR/SSG à mettre en cache, donc aucune surcharge de cache incrémental.
export default defineCloudflareConfig({});
