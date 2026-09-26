async function test() {
  const query = `
    [out:json];
    node["amenity"="charging_station"](26.0,77.0,29.0,81.0);
    out 5;
  `;
  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query
    });
    const data = await response.json();
    console.log(data);
  } catch (e) {
    console.error(e);
  }
}
test();
