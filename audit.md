 # Solidity Smart Contract Security Audit Model

Complete fine-tuning pipeline for Qwen2.5-Coder-7B on smart contract security data. Single file `audit.py` designed for Kaggle notebook (T4 GPU).
 
---  

 
## Phase 1: Data Pipeline (✅ Complete) 
 
| Block | Status | What it does                                                                 |  
| ----- | ------ | ----------------------------------------------------------------------------  |
| **1** | ✅      | Environment setup & `pip install`                                            |  
| **2** | ✅      | Imports & CONFIG dict                                                        | 
| **3** | ✅      | Dataset collection: Solodit, SmartBugs, VulnDB, DISL, EVuLLM → 130K examples | 
| **4** | ✅      | Quality scoring (0-100), dedup, filtering                                    |
| **5** | ✅      | ChatML formatting, train/eval split, HF Dataset                              |

## Phase 2: Training & Export (✅ Complete)  

| Block | Status | What it does                                                |
| ----- | ------ | ----------------------------------------------------------- |
| **6** | ✅      | QLoRA training (500 steps, T4 safe, auto-resume)            |
| **7** | ✅      | LoRA merge, save `.safetensors`, test inference, backup zip |

**Result:** Model identifies reentrancy, CEI violations, access control issues. But only trained on ~2,000/130K examples (1.6%) due to T4 memory limits.

---

## Phase 3: Unsloth Rewrite (🔜 Next)

Rewrite Block 6 using [Unsloth](https://github.com/unslothai/unsloth) for **2-5× faster training, 70% less VRAM**.

| Metric         | Current (vanilla)  | With Unsloth   |
| -------------- | ------------------ | -------------- |
| VRAM usage     | ~15.5 GB (crashes) | ~9-10 GB       |
| Seq length     | 512 (truncated)    | 1024-2048      |
| Steps possible | 500                | 5,000-10,000   |
| Examples seen  | 2,000 (1.6%)       | 20,000+ (16%+) |

#### Changes:
- Replace `AutoModelForCausalLM` + `BitsAndBytesConfig` + `get_peft_model` → `FastLanguageModel`
- Remove manual quantization config (Unsloth handles it)
- Increase `max_seq_length` to 1024, `max_steps` to 5000 
 
--- 

## Phase 4: Improvements (Week 2-3)

### Week 2
 
#### Day 1-2: Benchmark Evaluation Suite (Priority 0 — do this FIRST)
- Build test set of **50 contracts** with known vulnerabilities
- Measure **precision** (are findings real?) and **recall** (did it catch all bugs?)
- Automate scoring so every improvement can be measured
- Categories: reentrancy, access control, oracle, flash loan, arithmetic, logic 

#### Day 3-4: Multi-Agent Inference (Priority 1)
- Split inference into **3 passes**: Scanner → Verifier → Reporter
- **Scanner**: identifies potential vulnerabilities (high recall)
- **Verifier**: self-correction loop, filters false positives (high precision)
- **Reporter**: formats findings with severity, impact, remediation
- Expected: **30-50% fewer false positives**

#### Day 5-6: RAG Integration (Priority 2)
- **ChromaDB** vector database of past audit reports (Solodit, Code4rena) 
- At inference: retrieve **top-5 similar past exploits** as context
- Keeps model current with new vulnerability patterns without retraining
- Better accuracy on novel/unseen protocol types

#### Day 7: Confidence Scoring & Severity Calibration 
- Model outputs **confidence %** per finding
- Filter low-confidence findings to reduce noise
- Calibrate severity ratings against real audit distributions 
- Prevent over-reporting "Critical" for minor issues

### Week 3

#### Day 1-3: Slither / Control Flow Graphs (Priority 3)
- Integrate [Slither](https://github.com/crytic/slither) static analyzer
- Generate **call graphs** and **control flow** as text representation
- Feed alongside source code for structural understanding
- Better at detecting **cross-function** and **cross-contract** vulnerabilities

#### Day 4-5: Multi-File & Full-Contract Context
- Real protocols are **10-50 files** with imports
- Add "summarize imports" preprocessing step
- Feed full contract context, not isolated functions
- Critical for detecting **composability risks**

#### Day 6-7: End-to-End Testing
- Test on **real DeFi protocols** (Aave, Uniswap, Compound forks)
- Compare findings against published audit reports
- Gas optimization findings as bonus output
- Document final accuracy metrics

---

## Verification Plan

### Automated
- Benchmark suite: precision/recall on 50-contract test set
- Regression tests: re-run benchmarks after each Phase 4 improvement

### Manual
- Run model against 3 real unaudited contracts
- Compare output quality vs GPT-4 on same contracts
- User acceptance testing on audit report format
