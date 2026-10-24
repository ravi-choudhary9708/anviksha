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
    let val = dsFeatures[name];

    // Compute derived features dynamically if not present
    if (val === undefined) {
      if (name === 'F_ratio_3043_2956' || name === 'F_turnover_ratio') {
        val = Number(dsFeatures.F3043 || 0) / (Number(dsFeatures.F2956 || 0) + 1e-5);
      } else if (name === 'F_ratio_2582_2678') {
        val = Number(dsFeatures.F2582 || 0) / (Number(dsFeatures.F2678 || 0) + 1e-5);
      } else if (name === 'F_mod10k_3836' || name === 'F_round_amount') {
        const amt = Number(dsFeatures.F3836 || 0);
        val = (amt > 0 && amt % 10000 === 0) ? 1.0 : 0.0;
      } else if (name === 'F_ratio_321_115' || name === 'F_passthrough') {
        val = Number(dsFeatures.F321 || 0) / (Number(dsFeatures.F115 || 0) + 1e-5);
      } else {
        val = 0;
      }
    }

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
