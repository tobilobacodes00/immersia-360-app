// Bindings and secrets (see wrangler.jsonc). Declared on the global Cloudflare.Env so `cloudflare:test` sees them.
declare namespace Cloudflare {
  interface Env {
    VIDEOS: R2Bucket;
    HUB: DurableObjectNamespace<import('./hub').BoothHub>;
    SHARING_KEY: string;
    R2_ACCOUNT_ID: string;
    R2_BUCKET_NAME: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
  }
}
type Env = Cloudflare.Env;
