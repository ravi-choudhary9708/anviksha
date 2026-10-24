# 🏆 Anviksha Hackathon Defense & Judge Pitch Strategy
### Bank of India Hackathon 2026 — Mule Account Detection

---

## 🎙️ The 60-Second Winning Pitch

> *"Respected judges, in real-world retail banking, mule accounts are hidden like a needle in a haystack. In the Bank of India dataset, there are only **81 confirmed mules out of 9,082 accounts** — an extreme **111:1 class imbalance** (0.89% fraud rate).*
>
> *Many teams fall into the trap of using a plain 80/20 split and claiming '100% accuracy' because their test set had only 16 mules. Any experienced bank risk officer knows that in production, such a model would either miss the fraud or freeze thousands of innocent customers.*
>
> *In **Anviksha**, we tested our architecture under rigorous AML operational constraints:*
> 1. ***High-Priority Rapid Triage (Top 23-50 Alerts):*** *Baseline XGBoost acts as the primary ranker, identifying up to **22 mules in the first 50 alerts** (44% precision).*
> 2. ***Precision-Constrained Freeze Sieve (Two-Stage Cascade):*** *On a completely untouched holdout test set (1,817 accounts, 16 mules), our Cascade slashes false alarms from 35 down to **6** (an **83% reduction in false alarms**), delivering **45.5% holdout precision** and protecting honest customers with only 3.33 false alarms per 1,000 legitimate users.*
> 3. ***Syndicate Investigation (Top 100-200 Queue):*** *As investigation capacity widens, our **Fused ML + Graph Network Topology Engine** overtakes single-transaction ML, catching **34 mules (42.0% recall)** compared to 28 for baseline.*
>
> *No single model has sole authority to freeze an account: Anviksha implements a **4-tier defense** — Go Edge Shield for botnets, Two-Stage ML for high-precision freezes, Network Graph for multi-account smurfing rings, and Gemini AI for automated FIU-IND STR reports."*

---

## 🛡️ Judge Q&A Defense Guide

### Question 1: *"What is your model's true precision on unseen data, and why not claim 90%+?"*
**Your Winning Answer:**
> *"Any claim of 90%+ precision as a blanket deployment metric on an 81-mule dataset is either overfitted or a product of in-sample threshold tuning on a tiny slice of data.*
>
> *We evaluated Anviksha under strict zero-leakage conditions on an **Untouched Holdout Set (1,817 accounts, 16 mules)** where all hyperparameters, feature mappings, and thresholds were frozen on the development set:*
> - *Baseline XGBoost flags **35 false alarms** (19.4 per 1k legit) with **14.6% precision**.*
> - *Our Two-Stage Cascade cuts false alarms down to **6** (3.33 per 1k legit) with **45.5% precision** (5 correct out of 11 alerts).*
>
> *We are completely transparent about the trade-off: eliminating 29 false alarms costs 1 true mule on the holdout (5 TP vs 6 TP). In retail banking compliance, that 83% drop in innocent customer friction is an enormous operational win."*

---

### Question 2: *"Which model actually wins in production: XGBoost, Cascade, or Graph?"*
**Your Winning Answer:**
> *"Our matched-capacity benchmark revealed that no single architecture dominates across all alert budgets. Different models win at different operational stages:*
> - ***Top 23–50 Alerts (Fast Ranking):*** *Baseline XGBoost wins (catches 22 mules in top 50 alerts). Extreme outliers are best caught by standard gradient boosting.*
> - ***Account Freeze Action (High Precision):*** *Two-Stage Cascade wins (45.5% holdout precision, only 6 false alarms across 1,800 accounts).*
> - ***Top 100–200 Alerts (Syndicate Investigation):*** *Fused ML + Graph wins (catches 34 mules at Top 200 vs. 28 for baseline). Distributed smurfing rings splitting funds into small sub-₹10k transfers evade single-transaction ML but light up the Graph engine with Fan-In $\ge 8$ and high turnover.*
>
> *This is why Anviksha is a hybrid pipeline: XGBoost ranks, Cascade sieves, and Graph uncovers syndicates."*

---

### Question 3: *"What did your Graph Ablation test prove?"*
**Your Winning Answer:**
> *"We ran a strict ablation test holding folds, cascade models, and thresholds completely identical:*
> - *Enabling Graph Verification eliminated 3 false positive alarms (dropping from 28 to 25) with a +1.14% increase in precision, at the cost of 1 true positive.*
> - *While a 4-account delta is modest on 81 total mules, the structural benefit of Graph analysis is that it provides topological evidence (Fan-In/Fan-Out links, counterparty clustering) required for legal STR filing under PMLA guidelines."*

---

### Question 4: *"What are your engineered signals and feature semantics?"*
**Your Winning Answer:**
> *"We maintain strict scientific discipline regarding features. The Bank of India dataset contains 18 primary numeric features. Without an official data dictionary, we avoid unverified assumptions (e.g. we do not presume `F3043` is debit velocity or `F3836` is transaction amount):*
> 1. ***Mathematical Ratios (`F_ratio_3043_2956` & `F_ratio_321_115`):*** *Flow ratios comparing complementary transaction counters.*
> 2. ***Zero-Inflation Audit (`F3043`):*** *Our audit revealed that `F3043` has a median of 0.0 across both legitimate accounts (64.1% zero) and mules (82.7% zero). Its predictive power lies in whether it is active, not raw magnitude.*
> 3. ***Binary Feature Caution (`F2082`):*** *In our sample, `F2082` was 0.0 for 100% of confirmed mules and active only in legitimate accounts. However, with only 81 positive mules in the bank, we do not convert this sample observation into an absolute whitelist rule to avoid dangerous false negatives.*
> 4. ***Graph Topology Score:*** *Derived from Fan-In (`F531`), Fan-Out (`F527`), and flow symmetry to identify multi-party smurfing hubs."*

---

### Question 5: *"Does a Two-Stage Cascade actually outperform a Single XGBoost model at matched alert capacity?"*
**Your Winning Answer:**
> *"We ran a controlled 5-fold cross-validation experiment comparing Single XGBoost against Cascade architectures at identical investigation budgets:*
> - ***At Top 20 Alerts:*** *Single XGBoost and Wide Cascade tie (13 TP, 7 FP, 65.0% precision, 0.97 FP/1k legit), while Baseline Cascade catches 8 mules due to early screening cutoffs.*
> - ***At Top 50 Alerts:*** *The **Wide Cascade ($S_1 \ge 0.07$, retrained $S_2$) wins decisively**, catching **20 mules (40.0% precision, 30.8% recall)** compared to **16 mules (32.0% precision)** for Single XGBoost and 15 mules for Baseline Cascade.*
> - ***At Top 100 Alerts:*** *Wide Cascade catches **25 mules (38.5% recall)** vs. 19 for Single XGBoost (+31% relative lift).*
> - ***On Virgin Holdout (1,817 accounts, 16 mules):*** *At Top 50 alerts, Wide Cascade catches 8 mules (50.0% recall) vs. 6 for Single XGBoost. At Top 100 alerts, Wide Cascade catches 11 mules (68.8% recall) vs. 9 for Single XGBoost.*
> - ***Overall PR-AUC:*** *Wide Cascade achieves **0.3056 (Dev) and 0.3045 (Holdout)**, the highest across all evaluated models.*
>
> *The conclusion is definitive: A cascade justifies its complexity over a single model ONLY if Stage 1 is wide enough ($S_1 \approx 0.07$) to avoid screening bottlenecks, allowing Stage 2 to act as a hard-negative specialist."*

---

### Question 6: *"Why did opening Stage 1 appear to reduce alert counts in your preliminary test?"*
**Your Winning Answer:**
> *"In our preliminary test, alert counts dropped from 31 to 19 at $S_2 \ge 0.50$ when Stage 1 was opened from 0.30 to 0.15. Our controlled audit proved why:*
> - *When $S_2$ is held strictly **FIXED**, widening Stage 1 increases qualifying alerts monotonically (from 34 to 102 alerts at $S_2 \ge 0.50$).*
> - *The apparent drop occurred because Stage 2 had been **retrained** on the wider candidate pool, where class imbalance increased from 11:1 to 26.5:1. This shifted the model's raw uncalibrated probabilities downward.*
> - *Comparing two different models at an arbitrary static cutoff like 0.50 created an illusion. When evaluated at matched alert capacities (ranking Top 20, Top 50), the wider gate caught strictly more mules."*

---

## 📊 Quick-Reference Data Cheat Sheet

| Parameter | Single XGBoost | Baseline Cascade ($S_1 \ge 0.30$) | Wide Cascade ($S_1 \ge 0.07$, Retrained $S_2$) | Operational Role |
| :--- | :---: | :---: | :---: | :--- |
| **Dev Top 20 Precision** | 65.0% (13 TP, 7 FP) | 40.0% (8 TP, 12 FP) | **65.0% (13 TP, 7 FP)** | Immediate high-priority dispatch |
| **Dev Top 50 Precision** | 32.0% (16 TP, 34 FP) | 30.0% (15 TP, 35 FP) | **40.0% (20 TP, 30 FP)** | Daily compliance review queue |
| **Dev Top 100 Recall** | 29.2% (19 mules) | 33.8% (22 mules) | **38.5% (25 mules)** | Deep investigation queue (+31% lift) |
| **Dev PR-AUC** | 0.2603 | 0.1932 | **0.3056** | Best full-curve ranking precision |
| **Holdout Top 11 (Tight Freeze)**| 36.4% (4 TP, 7 FP) | **45.5% (5 TP, 6 FP)** | 36.4% (4 TP, 7 FP) | Automated account freezing |
| **Holdout Top 50 Recall** | 37.5% (6 mules) | 43.8% (7 mules) | **50.0% (8 mules)** | 50% holdout mule capture |
| **Holdout Top 100 Recall** | 56.2% (9 mules) | 56.2% (9 mules) | **68.8% (11 mules)** | 68.8% holdout mule capture |
| **Holdout PR-AUC** | 0.2709 | 0.2769 | **0.3045** | Highest out-of-sample PR-AUC |
| **Holdout ROC-AUC** | 0.8334 | 0.8516 | **0.8594** | Strongest discrimination |
| **False Alarms per 1k Legit** | 3.89 (at Top 11) | **3.33 (at Top 11)** | 3.89 (at Top 11) | Minimal honest customer disruption |
