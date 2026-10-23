import fs from 'fs';
import path from 'path';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const prodUrl = 'https://dashing-chipmunk-995.convex.cloud';
console.log(`Connecting to Convex Prod: ${prodUrl}`);
const client = new ConvexHttpClient(prodUrl);

const guestsJsonPath = path.resolve(process.cwd(), 'src/data/guests.json');
const allGuests = JSON.parse(fs.readFileSync(guestsJsonPath, 'utf8'));

console.log(`Total guests in guests.json: ${allGuests.length}`);

async function run() {
  const BATCH_SIZE = 100;
  let totalInserted = 0;

  for (let i = 0; i < allGuests.length; i += BATCH_SIZE) {
    const chunk = allGuests.slice(i, i + BATCH_SIZE);
    const batchData = chunk.map((g) => ({
      no: g.no,
      id: g.id,
      name: g.name,
      category: g.category,
      qr_payload: g.qr_payload,
      is_present: false,
      checked_in_at: undefined,
      checkin_method: undefined,
      is_walkin: false,
      pax: g.pax || 1,
      notes: g.notes || '',
    }));

    const res = await client.mutation(api.guests.seedGuestsBatch, { batch: batchData });
    totalInserted += res.inserted;
    console.log(`Synced batch ${i / BATCH_SIZE + 1} (${chunk.length} guests) -> inserted: ${res.inserted}`);
  }

  console.log(`\nDONE! Total inserted into Prod: ${totalInserted}`);
  const stats = await client.query(api.guests.getStats, {});
  console.log('Prod Stats after seed:', stats);
}

run().catch(console.error);
