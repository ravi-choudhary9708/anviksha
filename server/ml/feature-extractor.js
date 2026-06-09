// ============================================================
// Anviksha — Feature Extraction Engine (DataSet Driven)
// ============================================================
// Extracts 18 abstract features from the raw transaction data.
// Since we are using a static dataset, the generator injects
// these features directly. This module maps strings to ints
// based on the training mappings.
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load feature config (names + mappings)
const configPath = path.join(__dirname, 'models', 'feature_config.json');
let featureConfig = null;
try {
  featureConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.warn('[ML] Could not load feature_config.json. Please run train_model.py first.');
}

export const FEATURE_NAMES = featureConfig ? featureConfig.feature_names : [
  'F115', 'F321', 'F527', 'F531', 'F670', 'F1692', 'F2082', 'F2122', 
  'F2582', 'F2678', 'F2737', 'F2956', 'F3043', 'F3836', 'F3887', 
  'F3889', 'F3891', 'F3894'
];

/**
 * Extract all 18 features for a given transaction.
 * 
 * @param {Object} transaction - The transaction being scored
 * @param {string} accountId - The account being evaluated (unused in dataset mode)
 * @returns {Object} { features: Float32Array(18), featureMap: { name: value } }
 */
export function extractFeatures(transaction, accountId) {
  const featureValues = [];
  const featureMap = {};
  
  const dsFeatures = transaction.dataset_features || {};
  
  for (const name of FEATURE_NAMES) {
    let val = dsFeatures[name] !== undefined ? dsFeatures[name] : 0;
    
    // Check if this feature needs label encoding
    if (featureConfig && featureConfig.mappings && featureConfig.mappings[name]) {
      const mapping = featureConfig.mappings[name];
      if (typeof val === 'string') {
        val = mapping[val] !== undefined ? mapping[val] : 0;
      }
    }
    
    featureValues.push(Number(val));
    featureMap[name] = val;
  }
  
  // Create Float32Array for ONNX inference
  const features = new Float32Array(featureValues);
  
  return { features, featureMap };
}
