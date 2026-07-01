let capturedApp = null;
let capturedPool = null;
let radarLoaded = false;

const realExpress = require('express');
function wrappedExpress(...args) {
  const app = realExpress(...args);
  capturedApp = app;
  const originalGet = app.get.bind(app);
  app.get = function patchedGet(route, ...handlers) {
    if (route === '*' && !radarLoaded && capturedApp && capturedPool) {
      require('./radar')(capturedApp, capturedPool);
      radarLoaded = true;
    }
    return originalGet(route, ...handlers);
  };
  return app;
}
Object.assign(wrappedExpress, realExpress);
require.cache[require.resolve('express')].exports = wrappedExpress;

const pg = require('pg');
class WrappedPool extends pg.Pool {
  constructor(options) {
    super(options);
    capturedPool = this;
  }
}
require.cache[require.resolve('pg')].exports = { ...pg, Pool: WrappedPool };

require('./server2');
