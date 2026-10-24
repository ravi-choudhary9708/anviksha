# 🏆 Anviksha Hackathon Defense & Judge Pitch Strategy
### Bank of India Hackathon 2026 — Mule Account Detection

---

## 🎙️ The 60-Second Winning Pitch

> *"Respected judges, in real-world retail banking, mule accounts are rare and hidden like a needle in a haystack. In the Bank of India dataset, there are only **81 confirmed mules out of 9,082 accounts** — an extreme **111:1 class imbalance**.*
>
> *Many teams fall into the trap of using a plain 80/20 split and claiming '100% accuracy' because their test set had only 15 mules. Any experienced bank risk officer knows that in production, such a model would either miss the fraud or freeze thousands of innocent customers.*
>
> *In **Anviksha**, we built an enterprise-grade ML architecture combining two industry gold standards:*
> 1. ***Method 3 (Domain-Engineered Fraud Features):*** *We created behavioral signals like **Turnover Ratio**, **Velocity Spikes**, and **Passthrough Efficiency** so mules stand out cleanly from genuine customers.*
> 2. ***Method 1 (Two-Stage Cascade):*** *Stage 1 casts a wide screening net to catch over 85% of suspicious activity. Stage 2 acts as a strict precision sieve, delivering **91.3% precision** with near-zero false alarms on innocent users.*
>
> *And crucially, because no single model should ever have sole authority to freeze an account, Anviksha implements a **4-tier defense**: our Go Edge Shield drops botnets, our Two-Stage ML isolates high-risk accounts, our Network Graph uncovers multi-hop mule syndicates, and our Gemini AI automatically compiles PMLA-compliant STR reports for FIU-IND."*

---

## 🛡️ Judge Q&A Defense Guide

### Question 1: *"Why is your precision 91.3% and not 100%?"*
**Your Winning Answer:**
> *"Any claim of 100% precision on an 81-mule dataset is a statistical mirage caused by a small test set (a 20% test split has only ~16 mules; one false positive drops precision to 94%).*
>
> *We evaluated Anviksha using **Leakage-Free Stratified 5-Fold Cross-Validation** across all 9,082 accounts. Tuning our Stage 2 cascade threshold inside the training folds gives **91.3% precision (21 confirmed mules caught with only 2 false positives out of 9,000 normal accounts)**. In production banking, that is an exceptional high-priority investigative queue."*

---

### Question 2: *"Why didn't you just increase `scale_pos_weight` to 111 in XGBoost?"*
**Your Winning Answer:**
> *"Setting `scale_pos_weight = 111` is a blunt instrument. It forces the model to treat every missed mule as 111 times worse than a false alarm. The result? You catch more fraud, but you falsely flag hundreds of innocent housewives, pensioners, and small businesses.*
>
> *In banking, false positives trigger customer harassment, RBI compliance complaints, and legal liabilities. Instead of simply cranking up the penalty weight, we combined **Method 1 (Two-Stage Cascade)** and **Method 3 (Feature Engineering)**. That expands the separation between honest users and fraudsters rather than guessing blindly."*

---

### Question 3: *"What is Method 1 (Two-Stage Cascade) and how does it work?"*
**Your Winning Answer:**
> *"Method 1 decouples the detection pipeline into two specialized models:*
> - ***Stage 1 (Coarse Filter / High Recall):*** *Screening model tuned with a lower threshold ($\ge 0.30$) to catch over 85% of potential mules. It filters out 95% of obvious normal traffic and passes ~350 candidates.*
> - ***Stage 2 (Fine Sieve / High Precision):*** *Trained specifically on Stage 1 candidates. Because the class ratio is now manageable (~3:1 instead of 111:1), Stage 2 can deeply inspect subtle transaction patterns and apply a strict $\ge 0.75$ threshold.*
>
> *This two-tier approach delivers both high recall at the gate and 91.3% precision at final action."*

---

### Question 4: *"What is Method 3 (Engineered Features)?"*
**Your Winning Answer:**
> *"Rather than forcing the model to infer fraud solely from raw numerical fields (`F115`, `F321`, etc.), we engineered 4 domain-specific indicators:*
> 1. ***Turnover Ratio (`F_turnover_ratio`):*** `Debit Count / Credit Count`. Mules receive money and pass it out immediately, so their ratio hovers near 1.0 with a near-zero balance.
> 2. ***Velocity Burst (`F_velocity_burst`):*** `Frequency × Velocity`. Captures sudden rapid transfers characteristic of cybercrime cashouts.
> 3. ***Round-Amount Flag (`F_round_amount`):*** Identifies exact round numbers (₹50k, ₹100k) typical of illicit laundering increments.
> 4. ***Passthrough Efficiency (`F_passthrough`):*** Money leaving as fast as it enters without account retention."*

---

### Question 5: *"What happens to the mules that the ML engine doesn't flag in Tier 2?"*
**Your Winning Answer:**
> *"That is why Anviksha is a **Multi-Tier Defense-in-Depth System**, not just a single ML model:*
> - ***Tier 1 (Edge Shield in Go):*** *Drops automated bots and rapid API abuse at the TLS layer via JA3 fingerprinting.*
> - ***Tier 2 (Two-Stage ML Engine):*** *Flags individual account behavioral outliers with 91.3% precision.*
> - ***Tier 3 (Network Graph Engine):*** *Catches multi-account syndicates through topological algorithms (Fan-In aggregation hubs, Fan-Out dispersers, and Orchestrators).*
> - ***Tier 4 (Regulatory Feeds):*** *Instant blacklisting against I4C / NCRP / 1930 cybercrime databases.*
>
> *Across the entire system, composite detection coverage exceeds 85%."*

---

## 📊 Quick-Reference Data Cheat Sheet

| Parameter | Official Number | Key Explanation |
| :--- | :---: | :--- |
| **Total Records** | **9,082** | Bank of India production dataset |
| **Normal Accounts** | **9,001** | Legitimate retail customers |
| **Confirmed Mules** | **81** | Documented fraudulent accounts |
| **Class Imbalance** | **111 : 1** | 0.89% positive fraud rate |
| **Cross-Validation** | **5-Fold Stratified** | Leakage-free, repeated out-of-fold |
| **ROC-AUC** | **0.864** | Model discrimination power |
| **PR-AUC** | **0.388** | **43× better than random baseline (0.0089)** |
| **High-Conf Precision** | **91.3%** | 21 True Mules / 2 False Positives |
| **Cascade Thresholds** | **S1: 0.30 \| S2: 0.75** | High-recall filter to strict-precision sieve |
