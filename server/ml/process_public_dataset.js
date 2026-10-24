import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const TRAIN_PATH = path.join(PUBLIC_DIR, 'train_transaction.csv');
const TEST_PATH = path.join(PUBLIC_DIR, 'test_transaction.csv');
const OUTPUT_CSV_PATH = path.join(PUBLIC_DIR, 'submission_result.csv');
const OUTPUT_JSON_PATH = path.join(PUBLIC_DIR, 'model_results.json');

console.log('='.repeat(65));
console.log('   Anviksha — IEEE-CIS Fraud Detection ML Pipeline');
console.log('='.repeat(65));

// Fast Binner utility
function binAmount(amt) {
  if (amt <= 25) return '0_25';
  if (amt <= 50) return '25_50';
  if (amt <= 100) return '50_100';
  if (amt <= 200) return '100_200';
  if (amt <= 500) return '200_500';
  if (amt <= 1000) return '500_1000';
  return '1000_plus';
}

function binC(val) {
  if (val === undefined || isNaN(val)) return 'miss';
  if (val === 0) return '0';
  if (val === 1) return '1';
  if (val === 2) return '2';
  if (val <= 5) return '3_5';
  if (val <= 15) return '6_15';
  if (val <= 50) return '16_50';
  return '50_plus';
}

function binD(val) {
  if (val === undefined || isNaN(val)) return 'miss';
  if (val === 0) return '0';
  if (val <= 7) return '1_7d';
  if (val <= 30) return '8_30d';
  if (val <= 90) return '31_90d';
  if (val <= 365) return '91_365d';
  return '365d_plus';
}

function binV(val) {
  if (val === undefined || isNaN(val)) return 'miss';
  if (val === 0) return '0';
  if (val === 1) return '1';
  if (val <= 5) return '2_5';
  return '5_plus';
}

async function runPipeline() {
  const startTime = Date.now();

  console.log('\n[1/4] Streaming and training on public/train_transaction.csv (590,540 rows)...');

  const stream = fs.createReadStream(TRAIN_PATH);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let header = [];
  let colIndices = {};

  let totalTrain = 0;
  let trainFraud = 0;
  let trainNormal = 0;

  // Feature stats: { featureName: { binValue: { fraud: count, normal: count } } }
  const featureStats = {};

  function addStat(feat, binVal, isFraud) {
    if (!featureStats[feat]) featureStats[feat] = {};
    if (!featureStats[feat][binVal]) featureStats[feat][binVal] = { fraud: 0, normal: 0 };
    if (isFraud) featureStats[feat][binVal].fraud++;
    else featureStats[feat][binVal].normal++;
  }

  // To do a realistic out-of-time validation:
  // First 80% (472,432 rows) is Training
  // Last 20% (118,108 rows) is Validation
  const SPLIT_ROW = 472432;
  const valRows = []; // { id, trueFraud, features }

  let rowCount = 0;

  for await (const line of rl) {
    if (rowCount === 0) {
      header = line.split(',');
      for (let i = 0; i < header.length; i++) {
        colIndices[header[i]] = i;
      }
      rowCount++;
      continue;
    }

    const parts = line.split(',');
    const isFraud = parts[colIndices['isFraud']] === '1';
    const txnId = parts[colIndices['TransactionID']];
    const amt = parseFloat(parts[colIndices['TransactionAmt']]) || 0;
    const prod = parts[colIndices['ProductCD']] || 'miss';
    const card4 = parts[colIndices['card4']] || 'miss';
    const card6 = parts[colIndices['card6']] || 'miss';
    const pEmail = parts[colIndices['P_emaildomain']] || 'miss';
    const rEmail = parts[colIndices['R_emaildomain']] || 'miss';
    const dist1Miss = (!parts[colIndices['dist1']] || parts[colIndices['dist1']] === '') ? 'miss' : 'pres';
    const isRound = (amt % 1 === 0) ? 'round' : 'cent';

    const amtBin = binAmount(amt);
    const c1Bin = binC(parseFloat(parts[colIndices['C1']]));
    const c2Bin = binC(parseFloat(parts[colIndices['C2']]));
    const c4Bin = binC(parseFloat(parts[colIndices['C4']]));
    const c7Bin = binC(parseFloat(parts[colIndices['C7']]));
    const c8Bin = binC(parseFloat(parts[colIndices['C8']]));
    const c11Bin = binC(parseFloat(parts[colIndices['C11']]));
    const c13Bin = binC(parseFloat(parts[colIndices['C13']]));
    const c14Bin = binC(parseFloat(parts[colIndices['C14']]));

    const d1Bin = binD(parseFloat(parts[colIndices['D1']]));
    const d2Bin = binD(parseFloat(parts[colIndices['D2']]));
    const d3Bin = binD(parseFloat(parts[colIndices['D3']]));
    const d4Bin = binD(parseFloat(parts[colIndices['D4']]));
    const d15Bin = binD(parseFloat(parts[colIndices['D15']]));

    const v12Bin = binV(parseFloat(parts[colIndices['V12']]));
    const v29Bin = binV(parseFloat(parts[colIndices['V29']]));
    const v35Bin = binV(parseFloat(parts[colIndices['V35']]));
    const v53Bin = binV(parseFloat(parts[colIndices['V53']]));
    const v75Bin = binV(parseFloat(parts[colIndices['V75']]));
    const v82Bin = binV(parseFloat(parts[colIndices['V82']]));
    const v90Bin = binV(parseFloat(parts[colIndices['V90']]));
    const v127Bin = binAmount(parseFloat(parts[colIndices['V127']]) || 0);

    const m4 = parts[colIndices['M4']] || 'miss';
    const m6 = parts[colIndices['M6']] || 'miss';

    const sampleFeatures = {
      ProductCD: prod,
      card4,
      card6,
      P_emaildomain: pEmail,
      R_emaildomain: rEmail,
      TransactionAmt: amtBin,
      isRound,
      dist1Miss,
      C1: c1Bin,
      C2: c2Bin,
      C4: c4Bin,
      C7: c7Bin,
      C8: c8Bin,
      C11: c11Bin,
      C13: c13Bin,
      C14: c14Bin,
      D1: d1Bin,
      D2: d2Bin,
      D3: d3Bin,
      D4: d4Bin,
      D15: d15Bin,
      V12: v12Bin,
      V29: v29Bin,
      V35: v35Bin,
      V53: v53Bin,
      V75: v75Bin,
      V82: v82Bin,
      V90: v90Bin,
      V127: v127Bin,
      M4: m4,
      M6: m6,
    };

    if (rowCount <= SPLIT_ROW) {
      // Training phase
      totalTrain++;
      if (isFraud) trainFraud++;
      else trainNormal++;

      for (const [feat, binVal] of Object.entries(sampleFeatures)) {
        addStat(feat, binVal, isFraud);
      }
    } else {
      // Validation phase
      valRows.push({
        id: txnId,
        isFraud: isFraud ? 1 : 0,
        features: sampleFeatures
      });
    }

    rowCount++;
    if (rowCount % 150000 === 0) {
      console.log(`       Streamed ${rowCount.toLocaleString()} rows...`);
    }
  }

  console.log(`       Training set complete: ${totalTrain.toLocaleString()} rows (${trainFraud.toLocaleString()} frauds, ${((trainFraud/totalTrain)*100).toFixed(2)}%)`);
  console.log(`       Validation set: ${valRows.length.toLocaleString()} rows`);

  // Compute Weight of Evidence (WoE) and Information Value (IV)
  console.log('\n[2/4] Computing Bayesian Weight-of-Evidence (WoE) scorecard...');
  const woeTables = {};
  const featureIVs = [];

  const priorOdds = Math.log(trainFraud / trainNormal);

  for (const [feat, bins] of Object.entries(featureStats)) {
    woeTables[feat] = {};
    let iv = 0;

    for (const [binVal, counts] of Object.entries(bins)) {
      // Laplace smoothing
      const pFraud = (counts.fraud + 1) / (trainFraud + 2);
      const pNormal = (counts.normal + 1) / (trainNormal + 2);
      const woe = Math.log(pFraud / pNormal);
      woeTables[feat][binVal] = woe;
      iv += (pFraud - pNormal) * woe;
    }

    featureIVs.push({ feature: feat, iv });
  }

  featureIVs.sort((a, b) => b.iv - a.iv);

  function scoreFeatures(features) {
    let logOdds = priorOdds;
    let sumWoe = 0;
    let count = 0;

    for (const [feat, val] of Object.entries(features)) {
      const table = woeTables[feat];
      if (table) {
        const woe = table[val] !== undefined ? table[val] : 0;
        sumWoe += woe;
        count++;
      }
    }

    // Shrinkage regularization
    const alpha = 0.35;
    logOdds += alpha * sumWoe;
    // Sigmoid
    return 1 / (1 + Math.exp(-logOdds));
  }

  // Evaluate on Validation Set
  console.log('\n[3/4] Evaluating on out-of-time validation set (118,108 rows)...');
  const valPredictions = [];
  const valActuals = [];

  for (const item of valRows) {
    const prob = scoreFeatures(item.features);
    valPredictions.push(prob);
    valActuals.push(item.isFraud);
  }

  // Compute ROC-AUC using Mann-Whitney U rank statistic
  const paired = valPredictions.map((p, idx) => ({ prob: p, label: valActuals[idx] }));
  paired.sort((a, b) => a.prob - b.prob);

  let rankSumPositive = 0;
  let nPos = 0;
  let nNeg = 0;

  for (let i = 0; i < paired.length; i++) {
    const rank = i + 1;
    if (paired[i].label === 1) {
      rankSumPositive += rank;
      nPos++;
    } else {
      nNeg++;
    }
  }

  const uStat = rankSumPositive - (nPos * (nPos + 1)) / 2;
  const rocAuc = uStat / (nPos * nNeg);

  // Evaluate at multiple thresholds
  const optThreshold = 0.12; // Tuned for optimal F1 on 3.5% imbalanced fraud
  let tp = 0, fp = 0, fn = 0, tn = 0;

  for (let i = 0; i < valPredictions.length; i++) {
    const predFraud = valPredictions[i] >= optThreshold;
    const actualFraud = valActuals[i] === 1;

    if (predFraud && actualFraud) tp++;
    else if (predFraud && !actualFraud) fp++;
    else if (!predFraud && actualFraud) fn++;
    else tn++;
  }

  const precision = tp / (tp + fp);
  const recall = tp / (tp + fn);
  const f1 = (2 * precision * recall) / (precision + recall);

  console.log('='.repeat(65));
  console.log('  IEEE-CIS VALIDATION BENCHMARK RESULTS');
  console.log('='.repeat(65));
  console.log(`  Validation Samples:       ${valRows.length.toLocaleString()}`);
  console.log(`  Actual Validation Frauds: ${nPos.toLocaleString()} (${((nPos/valRows.length)*100).toFixed(2)}%)`);
  console.log(`  ROC-AUC Score:            ${rocAuc.toFixed(4)} (${(rocAuc*100).toFixed(2)}%)`);
  console.log(`  Decision Threshold:       ${optThreshold}`);
  console.log(`  True Positives (Caught):  ${tp.toLocaleString()}`);
  console.log(`  False Positives (Alerts): ${fp.toLocaleString()}`);
  console.log(`  False Negatives (Missed): ${fn.toLocaleString()}`);
  console.log(`  True Negatives (Safe):    ${tn.toLocaleString()}`);
  console.log(`  Recall:                   ${(recall * 100).toFixed(2)}% (catches ${tp.toLocaleString()} out of ${nPos.toLocaleString()} frauds)`);
  console.log(`  Precision:                ${(precision * 100).toFixed(2)}%`);
  console.log(`  F1-Score:                 ${f1.toFixed(4)}`);
  console.log('='.repeat(65));

  console.log('\n  Top 10 Most Predictive Fraud Signals (Information Value):');
  for (let i = 0; i < Math.min(10, featureIVs.length); i++) {
    console.log(`    ${(i+1).toString().padStart(2)}. ${featureIVs[i].feature.padEnd(20)} (IV: ${featureIVs[i].iv.toFixed(4)})`);
  }

  // Step 4: Stream and score public/test_transaction.csv (506,691 rows)
  console.log(`\n[4/4] Generating predictions for test set (${TEST_PATH})...`);

  const testStream = fs.createReadStream(TEST_PATH);
  const testRl = readline.createInterface({ input: testStream, crlfDelay: Infinity });

  const outWriteStream = fs.createWriteStream(OUTPUT_CSV_PATH);
  outWriteStream.write('TransactionID,isFraud\n');

  let testHeader = [];
  let testColIndices = {};
  let testCount = 0;
  let testFlagged = 0;
  let testProbSum = 0;

  for await (const line of testRl) {
    if (testCount === 0) {
      testHeader = line.split(',');
      for (let i = 0; i < testHeader.length; i++) {
        testColIndices[testHeader[i]] = i;
      }
      testCount++;
      continue;
    }

    const parts = line.split(',');
    const txnId = parts[testColIndices['TransactionID']];
    const amt = parseFloat(parts[testColIndices['TransactionAmt']]) || 0;
    const prod = parts[testColIndices['ProductCD']] || 'miss';
    const card4 = parts[testColIndices['card4']] || 'miss';
    const card6 = parts[testColIndices['card6']] || 'miss';
    const pEmail = parts[testColIndices['P_emaildomain']] || 'miss';
    const rEmail = parts[testColIndices['R_emaildomain']] || 'miss';
    const dist1Miss = (!parts[testColIndices['dist1']] || parts[testColIndices['dist1']] === '') ? 'miss' : 'pres';
    const isRound = (amt % 1 === 0) ? 'round' : 'cent';

    const amtBin = binAmount(amt);
    const c1Bin = binC(parseFloat(parts[testColIndices['C1']]));
    const c2Bin = binC(parseFloat(parts[testColIndices['C2']]));
    const c4Bin = binC(parseFloat(parts[testColIndices['C4']]));
    const c7Bin = binC(parseFloat(parts[testColIndices['C7']]));
    const c8Bin = binC(parseFloat(parts[testColIndices['C8']]));
    const c11Bin = binC(parseFloat(parts[testColIndices['C11']]));
    const c13Bin = binC(parseFloat(parts[testColIndices['C13']]));
    const c14Bin = binC(parseFloat(parts[testColIndices['C14']]));

    const d1Bin = binD(parseFloat(parts[testColIndices['D1']]));
    const d2Bin = binD(parseFloat(parts[testColIndices['D2']]));
    const d3Bin = binD(parseFloat(parts[testColIndices['D3']]));
    const d4Bin = binD(parseFloat(parts[testColIndices['D4']]));
    const d15Bin = binD(parseFloat(parts[testColIndices['D15']]));

    const v12Bin = binV(parseFloat(parts[testColIndices['V12']]));
    const v29Bin = binV(parseFloat(parts[testColIndices['V29']]));
    const v35Bin = binV(parseFloat(parts[testColIndices['V35']]));
    const v53Bin = binV(parseFloat(parts[testColIndices['V53']]));
    const v75Bin = binV(parseFloat(parts[testColIndices['V75']]));
    const v82Bin = binV(parseFloat(parts[testColIndices['V82']]));
    const v90Bin = binV(parseFloat(parts[testColIndices['V90']]));
    const v127Bin = binAmount(parseFloat(parts[testColIndices['V127']]) || 0);

    const m4 = parts[testColIndices['M4']] || 'miss';
    const m6 = parts[testColIndices['M6']] || 'miss';

    const testFeatures = {
      ProductCD: prod,
      card4,
      card6,
      P_emaildomain: pEmail,
      R_emaildomain: rEmail,
      TransactionAmt: amtBin,
      isRound,
      dist1Miss,
      C1: c1Bin,
      C2: c2Bin,
      C4: c4Bin,
      C7: c7Bin,
      C8: c8Bin,
      C11: c11Bin,
      C13: c13Bin,
      C14: c14Bin,
      D1: d1Bin,
      D2: d2Bin,
      D3: d3Bin,
      D4: d4Bin,
      D15: d15Bin,
      V12: v12Bin,
      V29: v29Bin,
      V35: v35Bin,
      V53: v53Bin,
      V75: v75Bin,
      V82: v82Bin,
      V90: v90Bin,
      V127: v127Bin,
      M4: m4,
      M6: m6,
    };

    const prob = scoreFeatures(testFeatures);
    outWriteStream.write(`${txnId},${prob.toFixed(5)}\n`);

    if (prob >= optThreshold) testFlagged++;
    testProbSum += prob;

    testCount++;
    if (testCount % 150000 === 0) {
      console.log(`       Scored ${testCount.toLocaleString()} test rows...`);
    }
  }

  outWriteStream.end();

  const totalScored = testCount - 1;
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n       ✅ Generated all ${totalScored.toLocaleString()} predictions!`);
  console.log(`       Saved to: ${OUTPUT_CSV_PATH}`);

  const report = {
    dataset: "IEEE-CIS Fraud Detection (public/)",
    train_total: totalTrain,
    train_fraud: trainFraud,
    train_fraud_rate: `${((trainFraud/totalTrain)*100).toFixed(2)}%`,
    validation_total: valRows.length,
    validation_fraud: nPos,
    metrics: {
      roc_auc: parseFloat(rocAuc.toFixed(4)),
      recall: parseFloat((recall * 100).toFixed(2)),
      precision: parseFloat((precision * 100).toFixed(2)),
      f1_score: parseFloat(f1.toFixed(4)),
      optimal_threshold: optThreshold,
      confusion_matrix: {
        true_positives: tp,
        false_positives: fp,
        false_negatives: fn,
        true_negatives: tn
      }
    },
    test_results: {
      total_transactions: totalScored,
      flagged_frauds: testFlagged,
      flagged_rate: `${((testFlagged / totalScored) * 100).toFixed(2)}%`,
      average_fraud_prob: parseFloat((testProbSum / totalScored).toFixed(4))
    },
    top_predictive_features: featureIVs.slice(0, 15),
    output_files: {
      predictions_csv: OUTPUT_CSV_PATH,
      metrics_json: OUTPUT_JSON_PATH
    },
    execution_time_seconds: parseFloat(elapsedSec)
  };

  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`       ✅ Saved benchmark summary report to: ${OUTPUT_JSON_PATH}`);

  console.log('='.repeat(65));
  console.log(`  COMPLETE IN ${elapsedSec}s!`);
  console.log(`  Identified ${testFlagged.toLocaleString()} suspected fraud transactions in test set.`);
  console.log('='.repeat(65));
}

runPipeline().catch(console.error);
