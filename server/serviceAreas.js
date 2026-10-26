'use strict';

// One company per deployment/database, matching the existing company settings.
function createServiceAreas({ database, transaction }) {
  database.exec(`CREATE TABLE IF NOT EXISTS service_area_catalog (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL CHECK (version > 0),
    defaultCityId TEXT NOT NULL,
    citiesJson TEXT NOT NULL
  )`);
  const select = database.prepare('SELECT version, defaultCityId, citiesJson FROM service_area_catalog WHERE id = 1');
  const save = database.prepare(`INSERT INTO service_area_catalog (id, version, defaultCityId, citiesJson)
    VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
    version = excluded.version, defaultCityId = excluded.defaultCityId, citiesJson = excluded.citiesJson`);

  function read() {
    const row = select.get();
    return row ? { version: row.version, defaultCityId: row.defaultCityId, cities: JSON.parse(row.citiesJson) }
      : { version: 0, defaultCityId: 'tehran', cities: [{ id: 'tehran', name: 'تهران', neighborhoods: [] }] };
  }

  function label(value) {
    if (typeof value !== 'string' || value.length > 120) return null;
    const name = value.normalize('NFKC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim().replace(/ +/g, ' ');
    return name.length > 0 && name.length <= 80 && /^[\p{L}\p{N}][\p{L}\p{N} \u200c().-]*$/u.test(name) ? name : null;
  }

  function publish(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).sort().join(',') !== 'cities,defaultCityId,expectedVersion' ||
        !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 ||
        !Array.isArray(input.cities) || input.cities.length < 1 || input.cities.length > 100) return { code: 'invalid' };
    const ids = new Set(), names = new Set();
    const cities = [];
    let total = 0;
    for (const city of input.cities) {
      if (!city || typeof city !== 'object' || Array.isArray(city) ||
          Object.keys(city).sort().join(',') !== 'id,name,neighborhoods' ||
          typeof city.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(city.id) || ids.has(city.id) ||
          !Array.isArray(city.neighborhoods) || city.neighborhoods.length > 500) return { code: 'invalid' };
      const name = label(city.name);
      if (!name || names.has(name.toLocaleLowerCase())) return { code: 'invalid' };
      const neighborhoods = city.neighborhoods.map(label);
      if (neighborhoods.some(value => !value) || new Set(neighborhoods.map(value => value.toLocaleLowerCase())).size !== neighborhoods.length) return { code: 'invalid' };
      total += neighborhoods.length;
      if (total > 5000) return { code: 'invalid' };
      ids.add(city.id); names.add(name.toLocaleLowerCase());
      cities.push({ id: city.id, name, neighborhoods });
    }
    if (!ids.has(input.defaultCityId)) return { code: 'invalid' };
    return transaction(() => {
      const current = read();
      if (current.version !== input.expectedVersion) return { code: 'conflict', catalog: current };
      // Catalog editing never deletes an existing city or rewrites user/order data.
      if (current.cities.some(city => !ids.has(city.id))) return { code: 'invalid' };
      save.run(current.version + 1, input.defaultCityId, JSON.stringify(cities));
      return { code: 'ok', catalog: read() };
    });
  }
  return { read, publish };
}

module.exports = { createServiceAreas };
