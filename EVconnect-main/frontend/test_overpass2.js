async function test() {
  const query = `[out:json];node["amenity"="charging_station"](8.0,68.0,37.0,97.0);out 5;`;
  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      body: query
    });
    const data = await response.json();
    console.log(data);
  } catch (e) {
    console.error(e);
  }
}
test();
