# Paper summary: Aljedaani et al. (2022)

W. Aljedaani, M. W. Mkaouer, S. Ludi, A. Ouni and I. Jenhani. "On the Identification of
Accessibility Bug Reports in Open Source Systems." 19th Web for All Conference (W4A '22),
Lyon, France, 2022. https://doi.org/10.1145/3493612.3520471.
Preprint: https://smilevo.github.io/access/Preprint/W4All_22_preprint.pdf

Notes written from the preprint, read on 2026-11-12. Where the text could not be read
unambiguously (Table 4 lost its layout in text extraction), that is said below.

## 1. Problem

Accessibility bug reports are a small share of all reports in large trackers and can be
missed or triaged late. The paper asks whether a classifier trained on the text of a
report can tell accessibility reports from other reports, so that they can be flagged
automatically. It argues, with two examples, that searching for the word "accessibility"
is not enough (it does not measure a keyword baseline).

Research questions: RQ1, how well do common classifiers identify accessibility reports;
RQ2, how much training data is needed (Random Forest only, F1, growing training sets,
results in Figure 4).

## 2. Dataset

- Sources: Bugzilla (Firefox Platform, Firefox Core, Apache NetBeans) and Monorail
  (Chromium: Android, Windows, Chrome, Mac). Seven projects kept out of more than 15
  examined, those whose tracker records the bug type; only "defect" reports were kept.
- Size: 2,567 accessibility reports and 256,700 other reports (about 1 to 100).
- Labels: accessibility reports were taken from the accessibility tags assigned in the
  trackers and checked against accessibility keywords from BBC and W3C guidance
  (Table 1). Two authors labelled a random sample of 334 of the 2,567 independently, a
  third resolved disagreements; Cohen's kappa 0.83. Non-accessibility reports were drawn
  at random from the remaining defect reports.
- Cleaning: non-English, invalid and non-meaningful reports (for example "Thank you")
  were removed.
- Input field: the bug report description only.
- The original dataset is available from the authors: project page
  https://smilevo.github.io/access/W4A22_index.html, "Bug Reports Dataset"
  https://smilevo.github.io/access/DataCollections/W4A_2022.zip. It was not retrieved or
  used here; this folder deliberately applies the method to the repository's own
  GitHub-issue dataset.

## 3. Model

1. Preprocessing (Section 3.2): tokenization, removal of numbers and special characters,
   stop-word removal (common English words plus extra terms such as "too", "for",
   "need"), lemmatization, lowercasing. Worked example: "Print dialog too large for
   screen when accessibility features being used; needs to be resizable" becomes "Print
   dialog large screen access feature use size".
2. Features: feature hashing (the "hashing trick"). Hash size and n-gram range are not
   reported.
3. Classifiers: Decision Tree, Random Forest, Decision Jungle, SVM, Neural Network.
   Table 4 lists hyperparameters. As read from the preprint: one tree model with max
   leaves 20, min samples per leaf 10, learning rate 0.2 and 100 trees (settings of a
   boosted tree ensemble; the text calls the tree models "tree-based ensemble models");
   a forest with 8 trees, max depth 32, a number of random splits per node (read as 125),
   min samples 1;
   Decision Jungle with 8 DAGs, max depth 32, max width 128, 2,048 optimization steps;
   SVM with 1 iteration and lambda 0.001; Neural Network with 100 hidden nodes, learning
   rate 0.1, 100 iterations, initial weight diameter 0.1, momentum 0. Which value belongs
   to which algorithm is my reading of a table whose layout was lost.
4. Class ratio: RQ1 pairs the accessibility reports with a multiple of other reports;
   the setup text describes doubling them ("Non-ABR X2") and Table 5 lists ratios up to
   x100. Table 6's caption does not say which ratio it reports.

## 4. Evaluation

- 10-fold cross-validation (the abstract says stratified; the body says 10-fold).
- Metrics: accuracy, precision, recall, F1 and AUC; Table 6 reports mean values.
- Results (Table 6): F1 from 0.81 to 0.93 across the seven projects and five
  classifiers; AUC from 0.89 to 0.98. Tree models and the neural network score highest;
  the SVM is lowest in most projects.
- No keyword baseline and no evaluation on a project left out of training.

## What carries over to this repository, and what does not

Carries over: the preprocessing steps, feature hashing, four of the five classifier
families with the listed hyperparameters, 10-fold cross-validation, and the metrics.

Does not carry over: the data (GitHub issues from 15 Android apps instead of Bugzilla and
Monorail defects), the labels (weak labels from repository labels and a keyword search, not
hand-checked and not ground truth, instead of tracker tags with a hand-verified sample), the class ratio (about 1 to 1.08
instead of 1 to 2 or more), Decision Jungle (no scikit-learn implementation), and the
paper's exact lemmatizer (no offline dictionary lemmatizer here) and hash size (not
reported). Scores from this
folder are therefore not comparable with Table 6.
