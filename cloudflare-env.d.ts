declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    LEAGUE_ADMIN_EMAIL?: string;
  }
}
