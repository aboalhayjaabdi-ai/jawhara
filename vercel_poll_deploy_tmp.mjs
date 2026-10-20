import { ProxyAgent, setGlobalDispatcher } from "undici";
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

const token = process.env.VERCEL_TOKEN_NEW;
const deploymentId = "dpl_75fynTp3c1Bq2SL7QtvNXUHM5hF9";

async function vfetch(path, opts = {}) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

for (let i = 0; i < 30; i++) {
  const res = await vfetch(`/v13/deployments/${deploymentId}`);
  const state = res.json.readyState;
  console.log(`[${i}] readyState=${state}`);
  if (state === "READY" || state === "ERROR" || state === "CANCELED") {
    console.log("Final alias:", JSON.stringify(res.json.alias));
    console.log("aliasAssigned:", res.json.aliasAssigned);
    if (state === "ERROR") {
      console.log("errorMessage:", res.json.errorMessage);
    }
    break;
  }
  await new Promise((r) => setTimeout(r, 10000));
}
