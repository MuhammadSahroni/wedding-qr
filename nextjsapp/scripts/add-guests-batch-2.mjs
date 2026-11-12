import fs from 'fs';
import path from 'path';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const rawCsv = `Hilda Nur Salsabila,SDI1030
"Wilda kamilatunnuuha, S. Mat",SDI1031
"Neng Ratna, S. Pd",SDI1032
Nabila puspitasari,SDI1033
Bpk Oman,RT01034
Bpk Mubazir,RT01035
Bpk. Dedi,RT01036
Bpk Alfian,RT01037
Bpk Mulyono,RT01038
Bpk Waluyo,RT01039
Bpk Cahyo,RT01040
Bpk Bambang,RT01041
Hanifah & Febrianto,RT01042
Widia Pravitasari,WAL1043
Erniati,WAL1044
Ramlan Hidayat,WAL1045
Nani ( umi Bagja ),WAL1046
Fitriah ( Umi Sasa),WAL1047
Yulianti ( Mama Farel ),WAL1048
Mama Humam,WAL1049
Keni Sihyanti,WAL1050
sari kumalasari,WAL1051
Heni Rosmayanti,WAL1052
Ernawati,PER1053
Ruth Andriyani ,APP1054
NAJMI ,NEX1055
Hilda Nur Salsabila,TAM1056
"Wilda kamilatunnuuha, S. Mat",TAM1057
"Neng Ratna, S. Pd",TAM1058
Nabila puspitasari,TAM1059
Bpk Oman,TAM1060
Bpk Mubazir,TAM1061
Bpk. Dedi,TAM1062
Bpk Alfian,TAM1063
Bpk Mulyono,TAM1064
Bpk Waluyo,TAM1065
Bpk Cahyo,TAM1066
Bpk Bambang,TAM1067
Hanifah & Febrianto,TAM1068
Widia Pravitasari,TAM1069
Erniati,TAM1070
Ramlan Hidayat,TAM1071
Nani ( umi Bagja ),TAM1072
Fitriah ( Umi Sasa),TAM1073
Yulianti ( Mama Farel ),TAM1074
Mama Humam,TAM1075
Keni Sihyanti,TAM1076
sari kumalasari,TAM1077
Heni Rosmayanti,TAM1078
Ernawati,TAM1079`;

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const results = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let name, id;
    if (trimmed.startsWith('"')) {
      const closingQuote = trimmed.indexOf('"', 1);
      name = trimmed.slice(1, closingQuote).trim();
      id = trimmed.slice(closingQuote + 1).replace(/^,/, '').trim();
    } else {
      const lastComma = trimmed.lastIndexOf(',');
      name = trimmed.slice(0, lastComma).trim();
      id = trimmed.slice(lastComma + 1).trim();
    }

    // Extract number from id
    const matchNo = id.match(/\d+$/);
    const no = matchNo ? parseInt(matchNo[0], 10) : results.length + 1030;

    // Category mapping
    let category = "Tamu Undangan";
    if (id.startsWith("SDI")) category = "Guru SD Islam";
    else if (id.startsWith("RT")) category = "Warga RT";
    else if (id.startsWith("WAL")) category = "WAL";
    else if (id.startsWith("PER")) category = "Perumahan / Relasi";
    else if (id.startsWith("APP")) category = "APP";
    else if (id.startsWith("NEX")) category = "NEXUS";
    else if (id.startsWith("TAM")) category = "TAMBAHAN";

    // pax: detect '&' or 'dan' or 'Istri' or 'Suami'
    let pax = 1;
    if (/&|dan/i.test(name)) {
      pax = 2;
    }

    results.push({
      no,
      id,
      name,
      category,
      qr_payload: id,
      pax
    });
  }
  return results;
}

const parsedGuests = parseCsv(rawCsv);
console.log(`Parsed ${parsedGuests.length} guests.`);

const batchData = parsedGuests.map(g => ({
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

  // Update src/data/guests.json
  const guestsJsonPath = path.resolve(process.cwd(), 'src/data/guests.json');
  const existingGuests = JSON.parse(fs.readFileSync(guestsJsonPath, 'utf8'));
  const existingIds = new Set(existingGuests.map(g => g.id.toUpperCase()));

  let jsonAppended = 0;
  for (const g of parsedGuests) {
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

