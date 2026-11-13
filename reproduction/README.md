# Applying the method of Aljedaani et al. (2022) to a new dataset

This folder applies the text-classification method of

> W. Aljedaani, M. W. Mkaouer, S. Ludi, A. Ouni and I. Jenhani. "On the Identification of
> Accessibility Bug Reports in Open Source Systems." W4A '22, Lyon, 2022.
> [doi:10.1145/3493612.3520471](https://doi.org/10.1145/3493612.3520471) ·
> [preprint (PDF)](https://smilevo.github.io/access/Preprint/W4All_22_preprint.pdf) ·
> [project page](https://smilevo.github.io/access/W4A22_index.html)

to this repository's GitHub-issue dataset. **It is not a reproduction of the paper's
results**: the data, the labels and the class ratio are different, so the scores below
cannot be compared with the paper's Table 6. The paper's own dataset is available from the
authors ([project page](https://smilevo.github.io/access/W4A22_index.html),
["Bug Reports Dataset" zip](https://smilevo.github.io/access/DataCollections/W4A_2022.zip));
it was not retrieved or used in this run. This work deliberately applies the method to the
existing GitHub-issue data. A four-question summary of the paper is in
[`notes/summary.md`](notes/summary.md). The paper's PDF is linked, not copied.

## Dataset

The repository's warehouse, rebuilt from the committed raw pages in `data/raw/` (no
network): GitHub issues from 15 open-source Android apps, an accessibility class and a
date-matched comparison sample (see the main README and `DATA.md`).

- **Weak labels.** Label 1 = the issue carries the app's accessibility label, or was
  returned by the keyword search (`talkback`, `screen reader`, `accessibility`, `a11y`)
  and really contains one of those words. Label 0 = a comparison issue from the same
  months. Nobody checked the labels by hand; they are weak labels, not ground truth.
- **Text:** the issue body only (the paper used the bug report description only). 25
  issues whose body has no token left after preprocessing are dropped, leaving **2,452
  issues: 1,180 accessibility, 1,272 comparison** (`results/dataset_summary.csv`).
- 983 of the 1,180 accessibility descriptions contain a search word, and 3 of the 1,272
  comparison descriptions do (`results/dataset_properties.csv`). That is the leakage this
  folder measures: most positives were selected *because* they contain these words.
- **Duplicates.** 161 issues fall into 47 groups of exact or near-duplicate descriptions
  (cosine >= 0.9 on hashed 1- and 2-grams of the masked text; mostly near-empty templates
  and Jira-sync stubs, for example in fenix and element-x-android). 9 groups contain both labels, 3 span two apps
  (`results/duplicates.csv`). Every split keeps a group on one side.
- **One app dominates.** mozilla-mobile/fenix supplies 583 of the 1,180 positives here
  (49.4%; 583 of 1,187 in the full warehouse view, 49.1%) but 1,149 of all 2,452 issues
  (46.9%). Either way a random split puts many fenix issues in both train and test, which
  is exactly why the leave-one-app-out and duplicate-grouped splits are reported.
- **Positives without a search word.** The main README counts 114 positives whose title
  and body contain no search word. Counted other ways on the same data: 119 positives in
  the warehouse view came only from the label query (not confirmed keyword hits; a few of
  them do contain a word but the keyword search did not return them), 118 of those are
  kept here, and because this folder uses the body only, 197 of the 1,180 kept positives
  have no search word in the body (the word may be in the title).
- **An accessibility-issue sample, not bug-only ground truth.** The positives include
  feature requests, not just defects (the paper kept defects only). Example:
  AntennaPod#8145 carries the maintainers' labels `Area: Accessibility` and
  `Type: Feature request`.
- **Complete is not reproducible.** A report that looks complete is not necessarily one a
  maintainer can reproduce; the supervisory review gives AntennaPod#6598 as an example
  (labelled `Type: Confirmed bug` and `Needs: Upstream fix`). The classifiers here predict
  the weak accessibility label only; they say nothing about whether a report is
  actionable or reproducible.

## Setup and run

Python 3 with the repository's `requirements.txt` (scikit-learn, pandas; no new
dependency). One command, from the repository root, no network:

```
pip install -r requirements.txt
python3 reproduction/src/run_all.py     # 19 to 25 minutes on 2 CPUs
python3 -m pytest -q reproduction/tests # 37 tests, about 10 s
```

`run_all.py` rebuilds `reproduction/build/` (a SQLite copy and the issue text; ignored by
git) and regenerates every file in `results/`. Steps, one script each in `src/`:
`build_dataset.py` → `preprocess.py` → `exp1_cv.py` → `ext_loao_masking.py` →
`control_shuffled.py` → `make_report.py`. Seed 0 everywhere; each step runs with one
BLAS/OpenMP thread. No model is saved.

**Measured run:** Linux x86_64 container, 2 CPUs (Intel Xeon @ 2.10GHz), 7 GB RAM,
Python 3.13.18, scikit-learn 1.9.1, numpy 2.5.3, pandas 3.0.5. Total 1,498 s: build 7.7 s,
preprocess 4.7 s, Experiment 1 252 s, extension 945 s, control 287 s, report 1.5 s.
Running it again from a fresh `git clone` of the branch (1,141 s on the same machine)
regenerated `results/` byte for byte (`diff -r` empty, `git status` clean). Other CPUs or library versions may change the last digits.

Input hashes (SHA-256, also in `results/data_hashes.csv`): all 496 raw pages
`b08b01c3…bcd80618`; `build/dataset.csv` `7610c59c…34ae097677`;
`build/preprocessed.csv` `97e224a6…8933d320c34d`.

## Method as applied

| Step | Paper | Here |
|---|---|---|
| Text | description | issue body |
| Preprocessing | tokenize, remove numbers and special characters, stop words, lemmatize, lowercase | same order; letters-only tokens of 2+ characters; scikit-learn's English stop list plus "too", "for", "need"; stdlib lemmatizer (below) |
| Features | feature hashing, size not reported | `HashingVectorizer`, 2^10 = 1,024 features (the default bit size of [Azure ML's Feature Hashing component](https://learn.microsoft.com/en-us/azure/machine-learning/component-reference/feature-hashing); a guess), 1- and 2-grams, counts, L2 norm |
| Decision Tree | max leaves 20, min leaf 10, learning rate 0.2, 100 trees | run twice: single `DecisionTreeClassifier(max_leaf_nodes=20, min_samples_leaf=10)`; boosted `GradientBoostingClassifier(n_estimators=100, learning_rate=0.2, max_leaf_nodes=20, min_samples_leaf=10)`, because the listed values describe a boosted ensemble |
| Random Forest | 8 trees, depth 32, min samples 1, random splits per node | `RandomForestClassifier(n_estimators=8, max_depth=32, min_samples_leaf=1)`; split count not mappable |
| SVM | 1 iteration, lambda 0.001 | linear SVM by SGD: `SGDClassifier(loss="hinge", alpha=0.001, max_iter=1)` |
| Neural Network | 100 hidden nodes, learning rate 0.1, 100 iterations, momentum 0 | `MLPClassifier((100,), solver="sgd", learning_rate_init=0.1, momentum=0, max_iter=100)`; weight-init diameter not mappable |
| Decision Jungle | 8 DAGs, depth 32, width 128 | **omitted**: no scikit-learn implementation |
| Evaluation | 10-fold CV (abstract: stratified); accuracy, precision, recall, F1, AUC (mean) | `StratifiedGroupKFold(10, shuffle=True, random_state=0)` with duplicate groups; same metrics, mean ± SD over folds |

Nothing is fitted outside a training fold: hashing is stateless, there is no resampling or
feature selection, and the lemmatizer is a fixed rule set. The duplicate groups are
computed once on all descriptions without labels; they only decide which rows may share a
fold. The Table 4 mapping is my reading of a table whose layout was lost in the preprint's
text; the paper does not name its software.

## Results

Generated tables: [`results/results.md`](results/results.md); per-fold and per-app rows in
the CSV files. All labels are weak labels (above).

**Experiment 1, the paper's pipeline (10-fold stratified CV, raw text), mean over folds:**

| Classifier | Precision | Recall | F1 | AUC |
|---|---|---|---|---|
| Decision Tree (single) | 0.846 | 0.822 | 0.833 | 0.884 |
| Decision Tree (boosted) | 0.898 | 0.835 | 0.865 | 0.931 |
| Random Forest | 0.735 | 0.736 | 0.735 | 0.830 |
| SVM (linear) | 0.835 | 0.766 | 0.779 | 0.902 |
| Neural Network | 0.836 | 0.793 | 0.799 | 0.907 |
| Keyword rule (not in the paper; "description contains a search word") | 0.997 | 0.833 | 0.907 | 0.915 |

**Extension: held-out apps and keyword masking (F1):**

| Classifier | 10-fold, raw | 10-fold, masked | Leave-one-app-out, raw | Leave-one-app-out, masked |
|---|---|---|---|---|
| Decision Tree (single) | 0.833 | 0.638 | 0.821 | 0.551 |
| Decision Tree (boosted) | 0.865 | 0.739 | 0.847 | 0.614 |
| Random Forest | 0.735 | 0.648 | 0.683 | 0.563 |
| SVM (linear) | 0.779 | 0.683 | 0.730 | 0.653 |
| Neural Network | 0.799 | 0.721 | 0.722 | 0.603 |
| Keyword rule | 0.907 | 0.000 | 0.908 | 0.000 |

Leave-one-app-out: each app is scored by a model trained on the other 14 apps, with any
near-duplicate of a held-out issue also removed from training; F1 is pooled over all
held-out issues. Masked: `accessib*`, `a11y`, `talkback`/`talk back` and
`screen reader(s)` are removed from the description before preprocessing. Per app,
masked, the boosted tree's F1 ranges from 0.495 (woocommerce-android) to 0.800
(pocket-casts-android, home-assistant/android; 24 and 27 issues).

**Shuffled-label control** (labels permuted once, same grouped folds): mean AUC 0.489 to
0.523 for the five classifiers, all within the 0.05 pass band around 0.5
(`results/control_shuffled.csv`). The run stops with an error if any classifier falls
outside it.

## Differences from the paper

- Data: GitHub issues from 15 Android apps, not Bugzilla and Monorail defect reports
  from seven projects. Feature requests and tasks are not filtered out.
- Labels: weak labels from repository labels and a keyword search, not tracker tags with
  a hand-verified sample (the paper reports kappa 0.83 on 334 reports).
- Class ratio about 1 to 1.08, not 1 to 2 or more; no resampling.
- Decision Jungle omitted. The "Decision Tree" row is run as a single tree and as a
  boosted ensemble because Table 4 is ambiguous.
- Lemmatizer: NLTK is not installed and WordNet would need a download, so
  `src/preprocess.py` uses Porter (1980) steps 1a and 1b plus an irregular-form table.
  On the paper's own example it gives "print dialog large screen accessibility feature use
  resizable" where the paper gives "print dialog large screen access feature use size".
  It is cruder than a dictionary lemmatizer (for example "settings" becomes "set").
- Hash size and n-gram range are not in the paper; 1,024 features and 1- and 2-grams are
  choices made here.
- Non-English reports were not removed (no language detector offline).
- Grouped folds (duplicates kept together) and the two extra evaluations are additions.

## What was learned

- On raw text the pipeline scores F1 0.73 to 0.87, but a one-line rule, "does the
  description contain one of the search words", scores 0.907. Most positives were
  selected by those words, so raw-text scores mostly measure the selection, not the
  classifiers.
- With the words masked, every classifier loses 0.08 to 0.20 F1 in 10-fold CV and more
  on unseen apps (boosted tree 0.865 → 0.614). What is left (F1 0.55 to 0.65 on unseen
  apps, AUC 0.61 to 0.73) is above the shuffled-label control, so the descriptions carry
  some signal beyond the four words, but much less than the raw scores suggest.
- Leave-one-app-out matters: 10-fold CV mixes issues of the same app into train and
  test, and every masked score is lower when the app is held out.
- The SVM with the paper's one-iteration setting is unstable: its fold-to-fold SD of
  recall is 0.145 on raw text.

## Limitations

- Weak labels; neither class was verified by hand. A comparison issue can be an
  unlabelled accessibility issue.
- fenix is 47% of the data and dominates every pooled number.
- The near-duplicate threshold (cosine 0.9) is one choice; issues that are similar below
  it can still share a fold.
- The masking list is the selection words and their direct variants. Related words
  (for example "contrast", "label", "content description") are kept on purpose; they are
  part of what a classifier could legitimately learn, but some may also correlate with how
  maintainers label.
- One seed and one shuffle; no confidence intervals beyond the fold SD.
- AUC pooled over held-out apps mixes scores from 15 different models; per-app AUCs are in
  `results/ext_loao_per_app.csv`.
- No interviews, user studies or practitioner feedback were part of this work, and no
  real-world use is claimed. The numbers are outputs of the method applied to weak-labelled
  data.
- Built with AI assistance (Claude). Every number above comes from `run_all.py` output in
  `results/`.
