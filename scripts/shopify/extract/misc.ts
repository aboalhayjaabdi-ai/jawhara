import { shopifyGraphQL } from "../client.ts";
import { appendJsonl, isDone, markDone, resetResource } from "./util.ts";

// Small resources (well under one page each for this store) — single-shot extraction.
const JOBS: Array<{ resource: string; query: string; pick: (d: any) => unknown[] }> = [
  {
    resource: "pages",
    query: `{ pages(first: 100) { edges { node { id title handle body createdAt updatedAt } } } }`,
    pick: (d) => d.pages.edges.map((e: any) => e.node),
  },
  {
    resource: "blogs",
    query: `{ blogs(first: 50) { edges { node { id title handle articles(first: 100) { edges { node { id title handle body publishedAt tags image { url } } } } } } } }`,
    pick: (d) => d.blogs.edges.map((e: any) => e.node),
  },
  {
    resource: "menus",
    query: `{ menus(first: 50) { edges { node { id title handle items { id title type url resourceId items { id title type url resourceId } } } } } }`,
    pick: (d) => d.menus.edges.map((e: any) => e.node),
  },
  {
    resource: "locations",
    query: `{ locations(first: 50) { edges { node { id name isActive address { address1 city province zip countryCode } } } } }`,
    pick: (d) => d.locations.edges.map((e: any) => e.node),
  },
  {
    resource: "markets",
    query: `{ markets(first: 50) { edges { node { id name handle enabled regions(first: 10) { edges { node { ... on MarketRegionCountry { code name } } } } } } } }`,
    pick: (d) => d.markets.edges.map((e: any) => e.node),
  },
];

for (const job of JOBS) {
  if (isDone(job.resource)) {
    console.log(`✓ ${job.resource} already extracted`);
    continue;
  }
  resetResource(job.resource);
  const data = await shopifyGraphQL<any>(job.query);
  const records = job.pick(data);
  appendJsonl(job.resource, records);
  markDone(job.resource, records.length);
  console.log(`✓ ${job.resource}: ${records.length} records`);
}
