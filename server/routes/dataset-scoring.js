// ============================================================
// Anviksha — Dataset Scoring Routes
// ============================================================
// API endpoints for:
// - Model info (metrics, feature importance, training details)

import { Router } from 'express';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

const MODELS_DIR = resolve(__dirname, '..', 'ml', 'models');

router.get('/model-info', (req, res) => {
  try {
    const metricsPath = resolve(MODELS_DIR, 'training_metrics.json');
    const configPath = resolve(MODELS_DIR, 'feature_config.json');

    if (!existsSync(metricsPath) || !existsSync(configPath)) {
      return res.json({
        status: 'no_model',
        message: 'No trained model found. Run: python server/ml/train_model.py',
        metrics: null,
        featureImportance: [],
        goldenFeatures: null,
        modelInfo: null,
      });
    }

    const metrics = JSON.parse(readFileSync(metricsPath, 'utf-8'));
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));

    const importanceMap = config.feature_importance || {};
    const featureImportance = Object.entries(importanceMap)
      .map(([feature, importance]) => ({ feature, importance }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 25);

    const goldenFeatures = config.golden_features || {
      requested: [],
      available: [],
      in_top_20: [],
    };

    const modelInfo = {
      ...config.model_info,
      feature_count: config.feature_count,
      thresholds: config.thresholds,
    };

    res.json({
      status: 'ready',
      metrics,
      featureImportance,
      goldenFeatures,
      modelInfo,
    });
  } catch (err) {
    console.error('[DATASET] Error loading model info:', err.message);
    res.status(500).json({ error: 'Failed to load model info', details: err.message });
  }
});

router.get('/visualizations/:name', (req, res) => {
  const allowedFiles = [
    'roc_curve.png', 'pr_curve.png', 'confusion_matrix.png',
    'feature_importance.png', 'golden_features_validation.png',
    'eda_class_distribution.png', 'eda_missing_values.png',
    'eda_golden_features_corr.png',
  ];

  const fileName = req.params.name;
  if (!allowedFiles.includes(fileName)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const filePath = resolve(MODELS_DIR, fileName);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Visualization not generated yet' });
  }

  res.sendFile(filePath);
});

router.get('/eda-report', (req, res) => {
  try {
    const reportPath = resolve(MODELS_DIR, 'eda_report.json');
    if (!existsSync(reportPath)) {
      return res.json({ status: 'not_generated', message: 'Run dataset_analyzer.py first' });
    }
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    res.json({ status: 'ready', ...report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
