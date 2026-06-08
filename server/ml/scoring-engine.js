// ============================================================
// Anviksha — ML Scoring Engine
// ============================================================
// Loads XGBoost + Isolation Forest ONNX models and runs
// real-time inference on extracted features. Falls back to
// rule-based scoring if ONNX models are not available.
// ============================================================

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractFeatures, FEATURE_NAMES } from './feature-extractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Model file paths
const MODELS_DIR = resolve(__dirname, 'models');
const XGB_MODEL_PATH = resolve(MODELS_DIR, 'xgboost_fraud.onnx');
const ISO_MODEL_PATH = resolve(MODELS_DIR, 'isolation_forest.onnx');
const CONFIG_PATH = resolve(MODELS_DIR, 'feature_config.json');

// ONNX Runtime session references (loaded once at startup)
let ort = null;           // onnxruntime-node module
let xgbSession = null;    // XGBoost inference session
let isoSession = null;    // Isolation Forest inference session
let featureConfig = null;  // Feature names and thresholds
let useONNX = false;       // Whether ONNX models are available

// ============================================================
// Initialize — load ONNX models or fall back to rule-based
// ============================================================
export async function initScoringEngine() {
  // Try to load ONNX models
  const modelsExist = existsSync(XGB_MODEL_PATH) && existsSync(ISO_MODEL_PATH);
  
  if (modelsExist) {
    try {
      // Dynamic import of onnxruntime-node
      ort = await import('onnxruntime-node');
      
      // Load XGBoost model
      xgbSession = await ort.InferenceSession.create(XGB_MODEL_PATH);
      console.log('[ML] ✅ XGBoost ONNX model loaded');
      
      // Load Isolation Forest model
      isoSession = await ort.InferenceSession.create(ISO_MODEL_PATH);
      console.log('[ML] ✅ Isolation Forest ONNX model loaded');
      
      // Load feature config
      if (existsSync(CONFIG_PATH)) {
        featureConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
        console.log('[ML] ✅ Feature config loaded');
      }
      
      useONNX = true;
      console.log('[ML] 🚀 ONNX inference engine ready (real ML models)');
    } catch (err) {
      console.error('[ML] ⚠️ Failed to load ONNX models, falling back to rule-based scoring');
      console.error('[ML]', err.message);
      useONNX = false;
    }
  } else {
    console.log('[ML] ⚠️ ONNX model files not found at', MODELS_DIR);
    console.log('[ML] ⚠️ Run "npm run train" (python server/ml/train_model.py) to train models');
    console.log('[ML] 📋 Using rule-based fallback scoring engine');
    useONNX = false;
  }
  
  return useONNX;
}

// ============================================================
// ONNX Inference — Run XGBoost + Isolation Forest
// ============================================================

/**
 * Run XGBoost model inference via ONNX Runtime.
 * Returns fraud probability (0.0 to 1.0)
 */
async function runXGBoostInference(features) {
  if (!xgbSession) return null;
  
  try {
    // Create input tensor — shape [1, 19] (one sample, 19 features)
    const inputTensor = new ort.Tensor('float32', features, [1, FEATURE_NAMES.length]);
    
    // Run inference
    const feeds = { float_input: inputTensor };
    const results = await xgbSession.run(feeds);
    
    // XGBoost output: probabilities for each class [normal_prob, fraud_prob]
    // We want the fraud probability (index 1)
    const outputName = xgbSession.outputNames.find(n => n.includes('probabilities')) || xgbSession.outputNames[1] || xgbSession.outputNames[0];
    const output = results[outputName];
    
    if (output && output.data) {
      // If output is class probabilities, take the fraud class (index 1)
      // Different ONNX converters format output differently
      if (output.data.length >= 2) {
        return output.data[1]; // Probability of fraud class
      }
      return output.data[0]; // Single output = fraud score
    }
    
    return null;
  } catch (err) {
    console.error('[ML] XGBoost inference error:', err.message);
    return null;
  }
}

/**
 * Run Isolation Forest inference via ONNX Runtime.
 * Returns anomaly score (negative = more anomalous)
 */
async function runIsolationForestInference(features) {
  if (!isoSession) return null;
  
  try {
    const inputTensor = new ort.Tensor('float32', features, [1, FEATURE_NAMES.length]);
    const feeds = { float_input: inputTensor };
    const results = await isoSession.run(feeds);
    
    // Isolation Forest output: decision_function score
    // More negative = more anomalous
    const outputName = isoSession.outputNames[0];
    const output = results[outputName];
    
    if (output && output.data) {
      // Output is label: 1 = normal, -1 = anomaly
      // We also need the decision function score if available
      const label = output.data[0];
      
      // Check if there's a second output with scores
      if (isoSession.outputNames.length > 1) {
        const scoreName = isoSession.outputNames[1];
        const scoreOutput = results[scoreName];
        if (scoreOutput && scoreOutput.data) {
          return { label, score: scoreOutput.data[0] };
        }
      }
      
      return { label, score: label === -1 ? -0.5 : 0.5 };
    }
    
    return null;
  } catch (err) {
    console.error('[ML] Isolation Forest inference error:', err.message);
    return null;
  }
}

// ============================================================
// Rule-Based Fallback Scoring
// ============================================================
// Used when ONNX models are not available. Implements the same
// 19 behavioral features with calibrated weights.

function ruleBasedScoring(featureMap) {
  let velocityScore = 0;
  let behavioralScore = 0;
  let graphScore = 0;
  let regulatoryScore = 0;
  
  // --- Velocity Sub-Score (0-100) ---
  // High transaction velocity = suspicious
  if (featureMap.txn_count_1h >= 8) velocityScore += 35;
  else if (featureMap.txn_count_1h >= 5) velocityScore += 20;
  else if (featureMap.txn_count_1h >= 3) velocityScore += 10;
  
  if (featureMap.txn_count_24h >= 30) velocityScore += 30;
  else if (featureMap.txn_count_24h >= 15) velocityScore += 15;
  
  if (featureMap.amount_received_1h >= 200000) velocityScore += 20;
  else if (featureMap.amount_received_1h >= 100000) velocityScore += 10;
  
  if (featureMap.avg_time_between_txns < 300) velocityScore += 15;
  else if (featureMap.avg_time_between_txns < 900) velocityScore += 8;
  
  velocityScore = Math.min(velocityScore, 100);
  
  // --- Behavioral Sub-Score (0-100) ---
  if (featureMap.is_off_hours) behavioralScore += 20;
  if (featureMap.is_round_amount) behavioralScore += 15;
  if (featureMap.is_near_threshold) behavioralScore += 25;
  if (featureMap.immediate_passthrough) behavioralScore += 30;
  if (featureMap.cross_channel_mixing) behavioralScore += 10;
  
  behavioralScore = Math.min(behavioralScore, 100);
  
  // --- Graph Sub-Score (0-100) ---
  if (featureMap.unique_senders_24h >= 10) graphScore += 35;
  else if (featureMap.unique_senders_24h >= 5) graphScore += 20;
  
  if (featureMap.unique_receivers_24h >= 5) graphScore += 25;
  else if (featureMap.unique_receivers_24h >= 3) graphScore += 15;
  
  if (featureMap.passthrough_ratio >= 0.85) graphScore += 30;
  else if (featureMap.passthrough_ratio >= 0.6) graphScore += 15;
  
  if (featureMap.is_new_account) graphScore += 10;
  
  graphScore = Math.min(graphScore, 100);
  
  // --- Regulatory Sub-Score (0-100) ---
  if (featureMap.suspect_registry_match) regulatoryScore += 60;
  if (featureMap.linked_to_flagged) regulatoryScore += 30;
  if (featureMap.previously_flagged) regulatoryScore += 20;
  if (featureMap.no_prior_history && featureMap.is_new_account) regulatoryScore += 10;
  
  regulatoryScore = Math.min(regulatoryScore, 100);
  
  return { velocityScore, behavioralScore, graphScore, regulatoryScore };
}

// ============================================================
// Main Scoring Function
// ============================================================

/**
 * Score a transaction and its associated account.
 * 
 * @param {Object} transaction - The transaction to score
 * @param {string} accountId - The account to evaluate
 * @returns {Object} Full scoring result with composite + sub-scores
 */
export async function scoreTransaction(transaction, accountId) {
  // Step 1: Extract features
  const { features, featureMap } = extractFeatures(transaction, accountId);
  
  let compositeScore = 0;
  let velocityScore = 0;
  let behavioralScore = 0;
  let graphScore = 0;
  let regulatoryScore = 0;
  let anomalyScore = 0;
  let modelType = 'rule_based';
  
  if (useONNX) {
    // ---- ONNX Model Inference ----
    modelType = 'xgboost+isolation_forest';
    
    // Run XGBoost — get fraud probability
    const xgbProb = await runXGBoostInference(features);
    
    // Run Isolation Forest — get anomaly score
    const isoResult = await runIsolationForestInference(features);
    
    if (xgbProb !== null) {
      // XGBoost probability (0-1) → scale to 0-100
      const xgbScore = xgbProb * 100;
      
      // Isolation Forest anomaly boost
      // If both models agree the transaction is suspicious, boost the score
      let isoBoost = 0;
      if (isoResult && isoResult.label === -1) {
        // Anomaly detected — boost score by 10-20 points
        isoBoost = Math.min(20, Math.abs(isoResult.score) * 30);
        anomalyScore = isoBoost;
      }
      
      // Composite = XGBoost base + Isolation Forest boost (capped at 100)
      compositeScore = Math.min(100, xgbScore + isoBoost);
      
      // Also compute rule-based sub-scores for explainability
      // (even with ONNX, we show the breakdown to analysts)
      const ruleScores = ruleBasedScoring(featureMap);
      velocityScore = ruleScores.velocityScore;
      behavioralScore = ruleScores.behavioralScore;
      graphScore = ruleScores.graphScore;
      regulatoryScore = ruleScores.regulatoryScore;
    } else {
      // XGBoost failed — fall back to rule-based
      const ruleScores = ruleBasedScoring(featureMap);
      velocityScore = ruleScores.velocityScore;
      behavioralScore = ruleScores.behavioralScore;
      graphScore = ruleScores.graphScore;
      regulatoryScore = ruleScores.regulatoryScore;
      compositeScore = (
        0.25 * velocityScore +
        0.20 * behavioralScore +
        0.25 * graphScore +
        0.30 * regulatoryScore
      );
      modelType = 'rule_based_fallback';
    }
  } else {
    // ---- Rule-Based Scoring ----
    const ruleScores = ruleBasedScoring(featureMap);
    velocityScore = ruleScores.velocityScore;
    behavioralScore = ruleScores.behavioralScore;
    graphScore = ruleScores.graphScore;
    regulatoryScore = ruleScores.regulatoryScore;
    
    // Weighted composite score
    compositeScore = (
      0.25 * velocityScore +
      0.20 * behavioralScore +
      0.25 * graphScore +
      0.30 * regulatoryScore
    );
  }
  
  // Round scores
  compositeScore = Math.round(compositeScore * 100) / 100;
  
  // Determine risk level and action
  let riskLevel, action;
  if (compositeScore >= 71) {
    riskLevel = 'critical';
    action = 'freeze_and_alert';
  } else if (compositeScore >= 41) {
    riskLevel = 'high';
    action = 'review_queue';
  } else if (compositeScore >= 21) {
    riskLevel = 'medium';
    action = 'monitor';
  } else {
    riskLevel = 'low';
    action = 'log';
  }
  
  return {
    compositeScore,
    velocityScore: Math.round(velocityScore),
    behavioralScore: Math.round(behavioralScore),
    graphScore: Math.round(graphScore),
    regulatoryScore: Math.round(regulatoryScore),
    anomalyScore: Math.round(anomalyScore),
    modelType,
    riskLevel,
    action,
    featureMap,
    features: Array.from(features),
  };
}

/**
 * Check if the scoring engine is using real ML models or rule-based fallback.
 */
export function isUsingONNX() {
  return useONNX;
}
