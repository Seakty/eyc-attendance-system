const assert = require('node:assert/strict');
const miniappRouter = require('../routes/miniapp');
const adminRouter = require('../routes/admin');

function getRoutePaths(router) {
  return (router.stack || []).filter((layer) => layer.route).map((layer) => layer.route.path);
}

assert.ok(Array.isArray(miniappRouter.stack), 'miniapp router should be an Express router');
const miniappPaths = getRoutePaths(miniappRouter);
assert.ok(miniappPaths.includes('/check-location'), 'missing /api/attendance/check-location route');
assert.ok(miniappPaths.includes('/check-in'), 'missing /api/attendance/check-in route');
assert.ok(miniappPaths.includes('/check-out'), 'missing /api/attendance/check-out route');
assert.ok(miniappPaths.includes('/scan'), 'missing /api/attendance/scan route');
assert.ok(miniappPaths.includes('/my-history'), 'missing /api/attendance/my-history route');

assert.ok(Array.isArray(adminRouter.stack), 'admin router should be an Express router');
const adminPaths = getRoutePaths(adminRouter);
assert.ok(adminPaths.includes('/dashboard'), 'missing /api/admin/dashboard route');
assert.ok(adminPaths.includes('/staff'), 'missing /api/admin/staff route');

console.log('API route regression checks passed');
