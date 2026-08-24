const fs = require('fs');
const path = require('path');

let cachedConfig = null;

function getStoreConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configCandidates = [
    path.resolve(__dirname, '..', '..', 'data', 'store-config.json'),
    path.resolve(__dirname, 'data', 'store-config.json'),
    path.resolve(process.cwd(), 'data', 'store-config.json'),
  ];
  const configPath = configCandidates.find((candidate) => fs.existsSync(candidate));

  if (!configPath) {
    throw new Error('Store configuration file is not available.');
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  cachedConfig = JSON.parse(raw);
  return cachedConfig;
}

function getCurrency() {
  return getStoreConfig().currency || 'GHS';
}

function getProducts() {
  return getStoreConfig().products || [];
}

function getProductBySku(sku) {
  return getProducts().find((product) => product.sku === sku) || null;
}

function getDeliveryZones() {
  return getStoreConfig().deliveryZones || [];
}

function getDeliveryZoneByCode(code) {
  return getDeliveryZones().find((zone) => zone.code === code) || null;
}

module.exports = {
  getStoreConfig,
  getCurrency,
  getProducts,
  getProductBySku,
  getDeliveryZones,
  getDeliveryZoneByCode,
};
