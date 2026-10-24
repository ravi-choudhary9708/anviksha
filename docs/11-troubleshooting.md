# 11 — Troubleshooting Guide

> **Anviksha** | Bank of India Hackathon 2026

---

## Table of Contents
- [Server Won't Start](#server-wont-start)
- [ML Training Errors](#ml-training-errors)
- [ONNX Loading Errors](#onnx-loading-errors)
- [Database Errors](#database-errors)
- [Frontend Errors](#frontend-errors)
- [WebSocket Issues](#websocket-issues)
- [API Errors](#api-errors)
- [Gemini API Errors](#gemini-api-errors)

---

## Server Won't Start

### Error: `Cannot find package 'dotenv'`
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'dotenv'
```

**Fix:**
```bash
npm install dotenv
```

---

### Issue: `better-sqlite3` build failure on Node 24 (`node-gyp rebuild` / Visual Studio error)
```
npm error gyp ERR! stack Error: Could not find any Visual Studio installation to use
npm error prebuild-install warn install No prebuilt binaries found (target=24.21.0 platform=win32)
```

**Resolution (Already implemented in Anviksha):**
Anviksha includes a zero-dependency native SQLite adapter in `server/db/index.js` utilizing Node.js built-in `node:sqlite` (`DatabaseSync`). It runs completely out-of-the-box without requiring Visual Studio C++ build tools, Python, or external compilation. If running on Node 22.5+ or Node 24+, simply run:
```bash
npm install
npm run seed
npm run dev
```

---

### Error: Port 3001 already in use
```
Error: listen EADDRINUSE: address already in use :::3001
```

**Fix (Windows):**
```powershell
# Find what's using port 3001:
netstat -ano | findstr :3001
# Kill that process (replace 12345 with the PID):
taskkill /PID 12345 /F
```

**Alternative:** Change the port in `.env`:
```
PORT=3002
```

---

### Error: `data/anviksha.db` not found (database not seeded)
```
SqliteError: no such table: accounts
```

**Fix:**
```bash
npm run seed
```

---

## ML Training Errors

### Error: `ModuleNotFoundError: No module named 'xgboost'`
```
ModuleNotFoundError: No module named 'xgboost'
```

**Fix:**
```bash
pip install xgboost scikit-learn numpy pandas onnx skl2onnx onnxmltools onnxconverter-common
```

---

### Error: Wrong `FloatTensorType` import
```
RuntimeError: Operator XGBClassifier (type: XGBClassifier) got an input float_input 
with a wrong type <class 'onnxconverter_common.data_types.FloatTensorType'>.
Only [<class 'onnxmltools.convert.common.data_types.FloatTensorType'>, ...] are allowed
```

**Root cause:** You're importing `FloatTensorType` from the wrong package.

**Fix in `train_model.py`:**
```python
# ❌ Wrong:
from onnxconverter_common import FloatTensorType as OnnxFloatTensorType

# ✅ Correct:
from onnxmltools.convert.common.data_types import FloatTensorType as OnnxFloatTensorType
```

---

### Error: Isolation Forest `ai.onnx.ml` version error
```
RuntimeError: The model is using version 4 of domain 'ai.onnx.ml' not supported yet 
by this library. You need to specify target_opset={'ai.onnx.ml': 3}.
```

**Fix in `train_model.py`:**
```python
# ❌ Wrong:
onnx_iso = convert_sklearn(iso_model, initial_types=..., target_opset=12)

# ✅ Correct:
onnx_iso = convert_sklearn(iso_model, initial_types=..., target_opset={'': 12, 'ai.onnx.ml': 3})
```

---

### Warning: `use_label_encoder` (not an error — ignore)
```
Parameters: { "use_label_encoder" } are not used.
```

This is a warning from XGBoost about a deprecated parameter. It doesn't affect training. Ignore it.

---

### Training completes but no `.onnx` files

If the script completes without the ONNX export step, check for errors between `[STEP 3]` and `[STEP 4]`. The training output should show:

```
[STEP 4] Exporting models to ONNX...
[EXPORT] Converting XGBoost to ONNX...
[EXPORT] XGBoost saved to C:\...\server\ml\models\xgboost_fraud.onnx
[EXPORT] Converting Isolation Forest to ONNX...
[EXPORT] Isolation Forest saved to C:\...\server\ml\models\isolation_forest.onnx
```

If you see an error between these lines, see the specific error above.

---

## ONNX Loading Errors

### Server shows `[ML] ⚠️ ONNX model files not found`

The ONNX files don't exist. You need to run the training script first:
```bash
python server/ml/train_model.py
```

---

### Error: `onnxruntime-node` not found
```
Error: Cannot find module 'onnxruntime-node'
```

**Fix:**
```bash
npm install onnxruntime-node
```

---

### Error: `Error: Node.js native addon was not built`
```
Error: The native addon was not built. 
Please try to rebuild onnxruntime-node...
```

**Fix:**
```bash
npm rebuild onnxruntime-node
# Or reinstall:
npm uninstall onnxruntime-node && npm install onnxruntime-node
```

---

### ONNX model loads but scores seem wrong

If the compositeScore is always 0 or always 100, the feature extractor may be sending wrong values.

**Debug:**
```powershell
# Check a specific transaction's features:
Invoke-RestMethod -Uri "http://localhost:3001/api/transactions?limit=1" | ConvertTo-Json -Depth 5
# Look at features_json — all values should be non-negative numbers
```

---

## Database Errors

### `SqliteError: database disk image is malformed`

The SQLite file is corrupted.

**Fix:**
```bash
del data\anviksha.db
npm run seed
```

---

### `SqliteError: UNIQUE constraint failed: transactions.txn_ref`

Duplicate transaction reference being inserted. This can happen if the server is started twice simultaneously.

**Fix:** Stop all server instances, then restart.

---

### Database grows too large during demo

The simulation inserts a transaction every 2 seconds. Over several hours, the DB will grow significantly.

**Fix:**
```bash
npm run seed  # Clears and re-seeds
```

---

## Frontend Errors

### Vite fails to start
```
Error: EADDRINUSE: address already in use :::5173
```

**Fix:**
```powershell
netstat -ano | findstr :5173
taskkill /PID <pid> /F
npm run dev:client
```

---

### Browser shows blank page

Check browser console (F12) for errors:

1. **"Cannot GET /"** — Vite isn't running. Start with `npm run dev:client`
2. **React errors** — Check the console for component errors
3. **CORS errors** — Make sure the backend is running on port 3001

---

### Dashboard not updating (WebSocket issues)

See [WebSocket Issues](#websocket-issues) below.

---

## WebSocket Issues

### Connection shows red dot ("Disconnected")

The WebSocket connection to the backend failed.

**Checks:**
1. Is the backend running? Visit `http://localhost:3001/api/health`
2. Is the backend on port 3001? Check `PORT` in `.env`
3. Check browser console for WebSocket error details

---

### No transactions appearing in Live Feed

Even if connected, no transactions = generator might not be running.

**Check server logs for:**
```
[GENERATOR] Starting transaction generator (interval: 2000ms)
```

If you see this, wait 2 seconds for the first transaction.
If you don't see it, the generator didn't start — restart the server.

---

### WebSocket sends `init` but no `transaction` events

The generator might have thrown an error. Check server logs for:
```
[GENERATOR] Error: ...
```

---

## API Errors

### `404 Not Found` for all routes

Express routes not mounted. Check `server/index.js` for:
```javascript
app.use('/api/transactions', transactionRouter);
app.use('/api/accounts', accountRouter);
// etc.
```

---

### POST /api/transactions returns 500

Usually means the scoring engine threw an error. Check server logs for:
```
[SCORING] Error: ...
```

Common causes:
- Feature extractor couldn't find the account in DB (wrong `account_id`)
- ONNX session is null (models didn't load)

---

## Gemini API Errors

### `Error: API key not valid`
```
GoogleGenerativeAIError: API key not valid
```

**Fix:** Update `GEMINI_API_KEY` in `.env` with a valid key from [ai.google.dev](https://ai.google.dev).

The system automatically falls back to template explanations — functionality is not affected.

---

### `Error: Resource has been exhausted (e.g. check quota)`

You've hit the free tier rate limit (15 req/min or 1500/day).

**Temporary fix:** The system uses template fallback when Gemini fails, so the dashboard continues to work. Wait for the rate limit to reset.

**Permanent fix:** The explainer only calls Gemini for `score >= 65`, which limits calls to high-risk transactions only. If you're hitting limits, raise this threshold in `server/ml/explainer.js`:
```javascript
// Change 65 to 75 to call Gemini less frequently:
if (scoring.compositeScore >= 75) {
  const explanation = await generateExplanation(...);
}
```

---

### Gemini returning empty string

Some prompts may return an empty response from Gemini. The explainer handles this with a fallback:
```javascript
const text = result.response.text();
if (!text || text.trim().length < 10) {
  return generateTemplateExplanation(data);  // Fallback
}
return text;
```
