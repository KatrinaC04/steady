// Verifies the Realtime session config is accepted by OpenAI (mints and discards one client secret).
// Usage: npm run check:realtime [-- path/to/.env.local]
import "./env";
import { POST } from "../app/api/realtime/token/route";

async function main() {
  const envFile = process.argv[2];
  if (envFile) process.loadEnvFile(envFile);
  for (const language of ["English", "中文", "Bilingual"]) {
    const response = await POST(new Request("http://local/api/realtime/token", { method: "POST", body: JSON.stringify({ language, source: "tab", silenceMs: 600 }) }));
    const body = await response.json();
    console.log(`${language.padEnd(9)} ${response.status} ${response.ok ? `ok (secret ${body.value ? "received" : "missing"})` : body.error}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
