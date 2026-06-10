import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, 'models', 'feature_config.json');
let featureConfig = null;
try {
  featureConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.warn('[ML] Could not load feature_config.json. Run train_model.py first.');
}

// The 18 BOI golden features used by the trained ONNX model
export const FEATURE_NAMES = featureConfig ? featureConfig.feature_names : [
  'F115', 'F321', 'F527', 'F531', 'F670', 'F1692', 'F2082', 'F2122',
  'F2582', 'F2678', 'F2737', 'F2956', 'F3043', 'F3836', 'F3887',
  'F3889', 'F3891', 'F3894'
];

export function extractFeatures(transaction, accountId) {
  const featureValues = [];
  const featureMap = {};

  const dsFeatures = transaction.dataset_features || {};

  for (const name of FEATURE_NAMES) {
    let val = dsFeatures[name] !== undefined ? dsFeatures[name] : 0;

    if (featureConfig && featureConfig.mappings && featureConfig.mappings[name]) {
      const mapping = featureConfig.mappings[name];
      if (typeof val === 'string') {
        val = mapping[val] !== undefined ? mapping[val] : 0;
      }
    }

    featureValues.push(Number(val) || 0);
    featureMap[name] = val;
  }

  const features = new Float32Array(featureValues);
  return { features, featureMap };
}
