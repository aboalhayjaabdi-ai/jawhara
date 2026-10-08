import { config } from "dotenv";
import { ProxyAgent, setGlobalDispatcher } from "undici";

config({ path: ".env.local" });
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

const URL_BASE = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const authHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

export async function ensureBucket(id: string, isPublic: boolean) {
  const res = await fetch(`${URL_BASE}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ id, name: id, public: isPublic }),
  });
  if (res.status === 200 || res.status === 201) {
    console.log(`✓ bucket created: ${id}`);
  } else {
    const body = await res.text();
    if (body.includes("already exists") || res.status === 409) {
      console.log(`✓ bucket already exists: ${id}`);
    } else {
      throw new Error(`Failed to create bucket ${id}: ${res.status} ${body}`);
    }
  }
}

export async function objectExists(bucket: string, path: string): Promise<boolean> {
  const res = await fetch(`${URL_BASE}/storage/v1/object/info/${bucket}/${path}`, { headers: authHeaders });
  return res.ok;
}

export async function uploadFile(bucket: string, path: string, data: Buffer, contentType: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": contentType, "x-upsert": "true" },
      body: data,
    });
    if (res.ok) return;
    if (res.status === 429 && attempt < 4) {
      const backoffMs = 1000 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }
    throw new Error(`Upload failed for ${path}: ${res.status} ${await res.text()}`);
  }
}

export function publicUrl(bucket: string, path: string) {
  return `${URL_BASE}/storage/v1/object/public/${bucket}/${path}`;
}
