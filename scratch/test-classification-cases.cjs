const accounts = [
  { id: "8d92a33f-1112-4c2b-9748-d5db5708ecb8", name: "A Plus Learning Academy Inc." },
  { id: "7aa3adb1-8806-463b-a87b-13570e43a40f", name: "ViaTech" },
  { id: "00fe843c-cd87-491b-a484-4d61dc8d12d3", name: "McKinney Avenue Transit Authority" },
  { id: "ac2e86ca-e982-43b8-9522-76a5c68b6b74", name: "Armstrong Moving & Storage Company" },
  { id: "62731d74-4cb4-4114-8bda-31087b215c0d", name: "Teasdale Latin Foods" },
  { id: "9a16c979-1090-4e42-b9a1-4670afb6e8f6", name: "Kim's Convenience Stores" },
  { id: "3e1bfc43-3a1e-48be-9f3f-8940d189777e", name: "Game Nerdz" },
  { id: "f458eac3-89d4-40c2-95e7-4fc3101fe690", name: "Navarro Regional Hospital" },
  { id: "7380ea11-7b0a-48e3-afa9-4fdac998e498", name: "Genesis Women's Shelter & Support" }
];

async function tryFetch(acc, port) {
  const url = `http://localhost:${port}/api/accounts/${acc.id}/intelligence-brief`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer dev-bypass-token',
      'Content-Type': 'application/json'
    }
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
  }
  return { status: res.status, data };
}

async function run() {
  const results = [];
  // Determine which port is active
  let activePort = 3000;
  try {
    console.log("Checking if port 3000 is active...");
    await fetch("http://localhost:3000/api/accounts/8d92a33f-1112-4c2b-9748-d5db5708ecb8/intelligence-brief", { method: 'POST' });
    console.log("Port 3000 is active.");
  } catch (err) {
    console.log("Port 3000 check failed (or not responding), falling back to port 3001...");
    activePort = 3001;
  }

  for (const acc of accounts) {
    console.log(`Regenerating brief for ${acc.name} (${acc.id}) on port ${activePort}...`);
    try {
      const { status, data } = await tryFetch(acc, activePort);
      
      const inferredCluster = data.brief?.inferredCluster || 
                             data.brief?.industry_cluster || 
                             data.brief?.industryCluster || 
                             data.account?.metadata?.intelligenceProfile?.industryCluster || 
                             null;

      results.push({
        name: acc.name,
        id: acc.id,
        status: status,
        inferredCluster,
        opener: data.brief?.opener || null,
        talk_track: data.brief?.talk_track || null,
        usedFallback: data.usedFallback
      });
    } catch (err) {
      console.error(`Request failed for ${acc.name} on port ${activePort}:`, err.message);
      results.push({ name: acc.name, id: acc.id, error: err.message });
    }
  }

  console.log("\n=================== TEST RESULTS ===================");
  console.log(JSON.stringify(results, null, 2));
}

run();
