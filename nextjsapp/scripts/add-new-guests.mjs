import fs from 'fs';
import path from 'path';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const guestsToAdd = [
  { name: "VINCY", id: "NEX0988", no: 988, category: "NEXUS", qr_payload: "NEX0988", pax: 1 },
  { name: "BHAYU SUGARDA", id: "APP0999", no: 999, category: "APP", qr_payload: "APP0999", pax: 1 },
  { name: "FAREL", id: "NEX1000", no: 1000, category: "NEXUS", qr_payload: "NEX1000", pax: 1 },
  { name: "NAJMI", id: "NEX1001", no: 1001, category: "NEXUS", qr_payload: "NEX1001", pax: 1 },
  { name: "Bpk. Slamet", id: "RT01002", no: 1002, category: "Warga RT", qr_payload: "RT01002", pax: 1 },
  { name: "Bpk. Saim", id: "RT01003", no: 1003, category: "Warga RT", qr_payload: "RT01003", pax: 1 },
  { name: "Bpk. Tri Mulyono", id: "RT01004", no: 1004, category: "Warga RT", qr_payload: "RT01004", pax: 1 },
  { name: "Bpk. Amin", id: "TWI1005", no: 1005, category: "TWI", qr_payload: "TWI1005", pax: 1 },
  { name: "Ibu Murtini", id: "YAY1006", no: 1006, category: "Yayasan", qr_payload: "YAY1006", pax: 1 },
  { name: "Bpk. Triono", id: "GP1007", no: 1007, category: "GP", qr_payload: "GP1007", pax: 1 },
  { name: "Ibu Yuliastuti", id: "KAR1008", no: 1008, category: "KARANG TARUNA", qr_payload: "KAR1008", pax: 1 },
  { name: "Gentur Arini", id: "REG1009", no: 1009, category: "REG", qr_payload: "REG1009", pax: 1 },
  { name: "Dina Camelia", id: "ULI1010", no: 1010, category: "ULI", qr_payload: "ULI1010", pax: 1 },
  { name: "Nur utami", id: "PER1011", no: 1011, category: "Perumahan / Relasi", qr_payload: "PER1011", pax: 1 },
  { name: "siti nurhimatul khoiriyah", id: "WAL1012", no: 1012, category: "WAL", qr_payload: "WAL1012", pax: 1 },
  { name: "Ibu Ongku Syarifah", id: "RT01013", no: 1013, category: "Warga RT", qr_payload: "RT01013", pax: 1 },
  { name: "Hadi Subarna", id: "FIT1014", no: 1014, category: "Fitrah", qr_payload: "FIT1014", pax: 1 },
  { name: "Sri Munatun", id: "GRA1015", no: 1015, category: "GRA", qr_payload: "GRA1015", pax: 1 },
  { name: "Komsatun", id: "GRA1016", no: 1016, category: "GRA", qr_payload: "GRA1016", pax: 1 },
  { name: "Febri Kuspriyani, S.Pd", id: "REG1017", no: 1017, category: "REG", qr_payload: "REG1017", pax: 1 },
  { name: "Wahyu", id: "TRI1018", no: 1018, category: "TRI", qr_payload: "TRI1018", pax: 1 },
  { name: "Wahyu Krisnadi", id: "HAN1019", no: 1019, category: "Hankook", qr_payload: "HAN1019", pax: 1 },
  { name: "Vera Oktavia", id: "HAN1020", no: 1020, category: "Hankook", qr_payload: "HAN1020", pax: 1 },
  { name: "Ais Aqil Sibawih", id: "HAN1021", no: 1021, category: "Hankook", qr_payload: "HAN1021", pax: 1 },
  { name: "Desya Widya Audina", id: "HAN1022", no: 1022, category: "Hankook", qr_payload: "HAN1022", pax: 1 },
  { name: "Muhammad Shaddam Numan", id: "HAN1023", no: 1023, category: "Hankook", qr_payload: "HAN1023", pax: 1 },
  { name: "Deadila Defiatri", id: "HAN1024", no: 1024, category: "Hankook", qr_payload: "HAN1024", pax: 1 },
  { name: "Ratu Intran Pratama", id: "HAN1025", no: 1025, category: "Hankook", qr_payload: "HAN1025", pax: 1 },
  { name: "Retna Wahyuni", id: "HAN1026", no: 1026, category: "Hankook", qr_payload: "HAN1026", pax: 1 },
  { name: "Ujang Bubus Bahrussalam", id: "HAN1027", no: 1027, category: "Hankook", qr_payload: "HAN1027", pax: 1 },
  { name: "Noerponco Bayuaji", id: "HAN1028", no: 1028, category: "Hankook", qr_payload: "HAN1028", pax: 1 },
  { name: "Moh Ratmani", id: "HAN1029", no: 1029, category: "Hankook", qr_payload: "HAN1029", pax: 1 },
];

const batchData = guestsToAdd.map((g) => ({
  no: g.no,
  id: g.id,
  name: g.name,
  category: g.category,
  qr_payload: g.qr_payload,
  is_present: false,
  checked_in_at: undefined,
  checkin_method: undefined,
  is_walkin: false,
  pax: g.pax,
  notes: '',
}));

async function main() {
  console.log(`Preparing to seed ${batchData.length} guests.`);

  // 1. Sync to Convex deployments
  const convexUrls = [
    'https://quiet-barracuda-406.eu-west-1.convex.cloud',
    'https://dashing-chipmunk-995.convex.cloud',
  ];

  for (const url of convexUrls) {
    try {
      console.log(`\nConnecting to Convex: ${url}`);
      const client = new ConvexHttpClient(url);
      const res = await client.mutation(api.guests.seedGuestsBatch, { batch: batchData });
      console.log(`Successfully seeded ${res.inserted} guests to ${url}!`);

      const stats = await client.query(api.guests.getStats, {});
      console.log(`New Stats for ${url}:`, stats);
    } catch (err) {
      console.error(`Error seeding to ${url}:`, err);
    }
  }

  // 2. Update src/data/guests.json
  const guestsJsonPath = path.resolve(process.cwd(), 'src/data/guests.json');
  const existingGuests = JSON.parse(fs.readFileSync(guestsJsonPath, 'utf8'));
  const existingIds = new Set(existingGuests.map((g) => g.id.toUpperCase()));

  let jsonAppended = 0;
  for (const g of guestsToAdd) {
    if (!existingIds.has(g.id.toUpperCase())) {
      existingGuests.push({
        no: g.no,
        id: g.id,
        name: g.name,
        category: g.category,
        qr_payload: g.qr_payload,
        pax: g.pax,
      });
      existingIds.add(g.id.toUpperCase());
      jsonAppended++;
    }
  }

  fs.writeFileSync(guestsJsonPath, JSON.stringify(existingGuests, null, 2), 'utf8');
  console.log(`\nUpdated src/data/guests.json (Appended ${jsonAppended} new guests, total now: ${existingGuests.length})`);
}

main().catch(console.error);

