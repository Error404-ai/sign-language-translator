# SignBridge usability study (Phase E)

The synopsis (§5.4.2) promises a usability evaluation. This kit is everything needed to run it in about **20 minutes per participant**, with **8–12 participants**. Aim for at least 3 who sign (ISL users, or students who have learned some ISL) and the rest hearing users.

| File | What it is |
|---|---|
| this file | protocol, tasks, questionnaire, what to report |
| [`results_template.csv`](results_template.csv) | one row per participant; fill in during or after the session |
| [`score.py`](score.py) | turns the CSV into SUS scores, task success rates and a summary table for the report |

---

## 1. Before the session

- [ ] Laptop on charge, Chrome, good front lighting, plain background.
- [ ] `docker compose up` (or the three terminals from the README). Open the app and check that all status dots are green.
- [ ] Open *Tuning & debug* and check that the latency line is showing.
- [ ] Clear the history (`curl -X DELETE localhost:5050/api/history`) so each session starts empty.
- [ ] Printed or on-screen copy of the sign sheet (the gesture guide in the app, plus a picture of each word sign).
- [ ] Assign the participant an ID: **P01, P02, …** Never write down names in the results.

## 2. Consent (read aloud, about 1 minute)

> "We are testing an app that translates Indian Sign Language to text and speech, and back. We are testing the **app, not you**. There are no wrong answers. The camera is used live only; **no video is recorded or saved**. Only the recognised words and timing numbers are kept, under an ID, not your name. You can stop at any time. Is it OK to continue?"

Note "yes" in the `consent` column. If they say no, stop.

## 3. Tasks

Show each task once and demonstrate it once if needed. Don't help during the attempt.

| # | Task | Mode | Success = |
|---|---|---|---|
| T1 | Sign **hello**, then **thank you** | Words | both appear correctly within 3 attempts each |
| T2 | Sign the sentence **"good morning, how are you"** | Words | all signs appear in the sentence bar, in order, within 3 attempts |
| T3 | Sign **doctor**, then **hospital** | Words | both correct within 3 attempts |
| T4 | Fingerspell your first name (or **SIGN** if it's long) | Letters | the full name appears; corrections are allowed |
| T5 | Do three trend gestures of your choice from the guide | Trends | 3 correct detections within 2 minutes |
| T6 | Type *"Hello, the doctor is at the hospital"* and press **Play** | Text → Sign | the participant can say which signs were shown |
| T7 | Press the mic and say *"Thank you, good night"* (or the Hindi equivalent) | Speech → Sign | the correct signs appear |

For each task record:
- **success** (1 or 0)
- **attempts** (signing tasks)
- **time** in seconds, from "go" to success or giving up (give up at 2 minutes)

## 4. Questionnaire (System Usability Scale)

Right after the tasks. Each item is scored **1 = strongly disagree … 5 = strongly agree**. Read the items exactly as written; they are the standard SUS wording (Brooke, 1996).

1. I think that I would like to use this system frequently.
2. I found the system unnecessarily complex.
3. I thought the system was easy to use.
4. I think that I would need the support of a technical person to be able to use this system.
5. I found the various functions in this system were well integrated.
6. I thought there was too much inconsistency in this system.
7. I would imagine that most people would learn to use this system very quickly.
8. I found the system very cumbersome to use.
9. I felt very confident using the system.
10. I needed to learn a lot of things before I could get going with this system.

Then ask three open questions and write the answers down briefly:
- **Q-good:** What worked best?
- **Q-bad:** What was most frustrating?
- **Q-want:** One thing you would add or change?

## 5. After each session

```bash
curl -s localhost:5050/api/latency > docs/study/latency_P01.json     # real latency while this person signed
curl -s localhost:5050/api/history > docs/study/history_P01.json     # what was recognised
```

## 6. Scoring and report

```bash
python docs/study/score.py docs/study/results.csv
```

The script prints:
- the SUS score per participant, plus the mean, standard deviation and the grade band (≥ 68 is above average, ≥ 80.3 is "excellent")
- the success rate, median time and mean attempts per task
- a Markdown table to paste into the report

**SUS scoring** (what the script does): odd items score *answer − 1*, even items score *5 − answer*; the sum is multiplied by **2.5**, giving 0–100.

Report these together:
- the SUS mean ± SD
- task success rates
- the latency p50/p95 from the sessions, compared with the 280 ms target
- 3–5 themes from the open answers
- limitations: a small sample, students rather than daily ISL users, and lab lighting
