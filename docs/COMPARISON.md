# SignBridge vs. published baselines

This table is for the report (synopsis §5.4.1 / §6). **Only compare like with like.** The notes column says why each row is or isn't directly comparable.

## Results

| System | Data | Task | Input | Result | Comparable? |
|---|---|---|---|---|---|
| **SignBridge (ours)** | 40 INCLUDE words + idle, 776 clips | Isolated word recognition | MediaPipe hand keypoints (30 × 130) → 2-layer LSTM | **88.5 % ± 3.2 %** accuracy, 5-fold CV · 87.2 % held-out split (macro F1 0.86) · top-3 99.4 % | — |
| **SignBridge (ours)** | 26 static letters A–Z, 130 recordings (1 signer) | Fingerspelling, single frame | same keypoints (130) → MLP | **96.0 % ± 3.8 %**, leave-one-recording-out | — |
| **SignBridge (ours)** | words, as above | End-to-end latency, capture → text on screen | browser + WebSocket + CPU | **p50 88 ms, p95 120 ms** (target ≤ 280 ms) | — |
| INCLUDE baseline (Sridhar et al., ACM MM 2020) | INCLUDE: 263 words / INCLUDE-50: 50 words | Isolated word recognition | Pose keypoints (MediaPipe Hands + BlazePose), several models incl. transformer and XGBoost | **⚠️ fill in from the paper's results table**: best accuracy on INCLUDE and on INCLUDE-50 | ✅ Same dataset family and the same kind of keypoint input. ⚠️ They use the official train/test split and more classes, we use 40 words with CV |
| Sign Language Transformers (Camgöz et al., CVPR 2020) | RWTH-PHOENIX-Weather-2014T: German SL, 9 signers, 1,066-sign vocabulary | **Continuous** recognition + translation | RGB video, end-to-end transformer | Recognition **WER 24.49 %** · translation **BLEU-4 21.80** (test) | ❌ Different language, continuous sentences rather than single words, and different metrics. Cite as the state of the art for sentence-level translation, not as a number to beat |

### Where the INCLUDE numbers come from

The ACM page blocks automated readers, so these weren't filled in automatically. Someone with AKGEC library access should open *Sridhar, Ganesan, Kumar, Khapra, "INCLUDE: A Large Scale Dataset for Indian Sign Language Recognition", ACM MM 2020, DOI 10.1145/3394171.3413528*, find the results table and copy:
- the best accuracy on **INCLUDE** and on **INCLUDE-50**, with the model name
- whether the input was pose keypoints or RGB, for the row above

Don't quote these numbers from memory or from blogs.

Sources read for the Camgöz row: arXiv 2003.13830, Table 1, row "Our Best Recog. Sign2(Gloss+Text)", test columns.

## How to describe our result honestly

- **What it is:** word-level accuracy on 40 INCLUDE signs. Clips were split randomly in 5-fold cross-validation, so the same INCLUDE signers appear in both training and test data.
- **What it is not (yet):** signer-independent. That needs the team recordings (`collect.py --signer NAME`) and `train.py --split signer`. Expect a lower number. Report it next to this one when it exists.
- **Why it's lower than with 15 signs (95.6 %):** more classes, and several signs share hand shapes (good / bad, I / you, hot / cold). Each INCLUDE word has only 14–21 examples.
- **What we add beyond the baselines:** a real-time browser system rather than an offline model. It runs at 88 ms median latency, works in both directions (text/speech → 3D sign avatar), has Hindi speech input, and recognises social-media gestures. None of that shows up in an accuracy number, so say it in the text.
