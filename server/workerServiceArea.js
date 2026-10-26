'use strict';

function createWorkerServiceArea({ database, transaction, areas, getUser }) {
  database.exec(`CREATE TABLE IF NOT EXISTS worker_service_areas (
    workerId TEXT PRIMARY KEY REFERENCES users(id),
    cityId TEXT NOT NULL, cityName TEXT NOT NULL, neighborhoodsJson TEXT NOT NULL,
    catalogVersion INTEGER NOT NULL, version INTEGER NOT NULL CHECK (version > 0)
  )`);
  const select = database.prepare('SELECT * FROM worker_service_areas WHERE workerId = ?');
  const upsert = database.prepare(`INSERT INTO worker_service_areas
    (workerId, cityId, cityName, neighborhoodsJson, catalogVersion, version) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(workerId) DO UPDATE SET cityId = excluded.cityId, cityName = excluded.cityName,
    neighborhoodsJson = excluded.neighborhoodsJson, catalogVersion = excluded.catalogVersion, version = excluded.version`);
  function read(workerId) {
    const row = select.get(workerId);
    return row ? { cityId: row.cityId, cityName: row.cityName, neighborhoods: JSON.parse(row.neighborhoodsJson),
      catalogVersion: row.catalogVersion, version: row.version } : null;
  }
  function save(workerId, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).sort().join(',') !== 'catalogVersion,cityId,expectedVersion,neighborhoods' ||
        typeof input.cityId !== 'string' || !Number.isSafeInteger(input.catalogVersion) || input.catalogVersion < 0 ||
        !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 ||
        !Array.isArray(input.neighborhoods) || !input.neighborhoods.length || input.neighborhoods.length > 500 ||
        input.neighborhoods.some(name => typeof name !== 'string') ||
        new Set(input.neighborhoods).size !== input.neighborhoods.length) return { code: 'invalid' };
    return transaction(() => {
      const user = getUser(workerId);
      if (!user || user.role !== 'WORKER' || user.status === 'BLOCKED') return { code: 'forbidden' };
      const catalog = areas.read(), current = read(workerId);
      if (catalog.version !== input.catalogVersion || (current?.version || 0) !== input.expectedVersion) return { code: 'conflict' };
      const city = catalog.cities.find(value => value.id === input.cityId);
      if (!city || input.neighborhoods.some(name => !city.neighborhoods.includes(name))) return { code: 'invalid' };
      upsert.run(workerId, city.id, city.name, JSON.stringify(input.neighborhoods), catalog.version, input.expectedVersion + 1);
      return { code: 'ok', area: read(workerId), catalog };
    });
  }
  return { read, save };
}
module.exports = { createWorkerServiceArea };
