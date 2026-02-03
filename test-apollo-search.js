
async function testSearchTitles() {
  const url = 'http://127.0.0.1:3001/api/apollo/search-people';
  const body = {
    page: 1,
    per_page: 50,
    q_organization_name: "Integrated Circuit Solutions USA",
    person_titles: ["owner", "founder", "c-level", "vp", "director", "manager"]
  };

  console.log('Testing with person_titles:', body.person_titles);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Total Entries:', data.pagination ? data.pagination.total_entries : 'N/A');
    console.log('People Found:', data.people ? data.people.length : 0);
    
    if (data.people && data.people.length > 0) {
        console.log('First Person:', data.people[0]);
    } 

  } catch (error) {
    console.error('Error:', error);
  }
}

// testSearch();
testSearchTitles();
