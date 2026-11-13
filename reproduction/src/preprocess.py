"""Step 2: text preprocessing as described in Aljedaani et al. (2022), Section 3.2.

The paper lists five steps: tokenization, removal of numbers and special characters,
stop-word removal, lemmatization, lowercasing. This module implements them with the
Python standard library and scikit-learn's built-in English stop-word list, so it needs
no download at run time.

NLTK is not installed in the environment this was built in, and its WordNet lemmatizer
would need `nltk.download()` (network) anyway. `lemmatize` is therefore a stdlib
substitute: step 1a and 1b of the Porter (1980) stemming algorithm (plural -s, -ed, -ing,
with Porter's clean-up rules), a small table of irregular forms, and two guards so that
words like "status" keep their final "s". It is cruder than a dictionary lemmatizer.

Masking (`mask`) removes the words that were used to select the accessibility sample. It
is applied to the raw text before preprocessing. The expression is the same one used by
analysis/classify.py (a test checks that they stay equal).

Run as a script: reads build/dataset.csv, writes build/preprocessed.csv with the raw and
masked processed text and a duplicate-group id per issue (pipeline.duplicate_groups).
"""
import re

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

from pipeline import DUPLICATE_COSINE, duplicate_groups

# Letters only: splitting on every non-letter tokenizes and, in the same step, removes
# numbers and special characters. Consequence: "a11y" becomes "a" + "y".
TOKEN_RE = re.compile(r"[A-Za-z]+")
MIN_TOKEN_LEN = 2

# scikit-learn's list (318 words) plus the extra terms the paper names ("too", "for",
# "need"; the first two are already in the list).
STOP_WORDS = frozenset(ENGLISH_STOP_WORDS) | {"too", "for", "need", "needs", "needed"}

MASK_RE = re.compile(r"accessib\w*|a11y|talk\s?back|screen[\s-]?readers?", re.I)

IRREGULAR = {
    "used": "use", "uses": "use", "using": "use",
    "is": "be", "are": "be", "was": "be", "were": "be", "been": "be", "being": "be",
    "has": "have", "had": "have", "having": "have",
    "does": "do", "did": "do", "done": "do", "doing": "do",
    "went": "go", "gone": "go", "goes": "go",
    "made": "make", "got": "get", "gotten": "get", "took": "take", "taken": "take",
    "gave": "give", "given": "give", "saw": "see", "seen": "see", "shown": "show",
    "wrote": "write", "written": "write", "broke": "break", "broken": "break",
    "found": "find", "children": "child", "men": "man", "women": "woman", "people": "person",
}
# Words ending in s that are not plurals (Porter would strip them).
KEEP_FINAL_S = re.compile(r"(ss|us|is|ous)$")
KEEP_WORDS = {"news", "series", "lens", "canvas", "alias", "bias", "ios", "https", "yes"}

VOWELS = set("aeiou")


def _is_consonant(word, i):
    ch = word[i]
    if ch in VOWELS:
        return False
    if ch == "y":
        return i == 0 or not _is_consonant(word, i - 1)
    return True


def _measure(stem):
    """Porter's m: the number of vowel-consonant sequences in the stem."""
    pattern = "".join("c" if _is_consonant(stem, i) else "v" for i in range(len(stem)))
    return len(re.findall(r"v+c+", pattern))


def _has_vowel(stem):
    return any(not _is_consonant(stem, i) for i in range(len(stem)))


def _ends_cvc(stem):
    """Porter's *o: consonant-vowel-consonant, last consonant not w, x or y."""
    if len(stem) < 3:
        return False
    return (_is_consonant(stem, len(stem) - 3) and not _is_consonant(stem, len(stem) - 2)
            and _is_consonant(stem, len(stem) - 1) and stem[-1] not in "wxy")


def lemmatize(word):
    """Map a lowercase token to an approximate lemma (Porter step 1a/1b + irregulars)."""
    if word in IRREGULAR:
        return IRREGULAR[word]
    if len(word) <= 3 or word in KEEP_WORDS:
        return word
    # Step 1a: plurals and third person singular.
    if word.endswith("sses"):
        word = word[:-2]
    elif word.endswith("ies") and len(word) > 4:
        word = word[:-3] + "y"
    elif re.search(r"(ch|sh|x|zz)es$", word):
        word = word[:-2]
    elif word.endswith("s") and not KEEP_FINAL_S.search(word):
        word = word[:-1]
    # Step 1b: -eed, -ed, -ing.
    if word.endswith("eed"):
        if _measure(word[:-3]) > 0:
            word = word[:-1]
        return word
    for suffix in ("ed", "ing"):
        stem = word[: -len(suffix)]
        if word.endswith(suffix) and _has_vowel(stem):
            if stem.endswith(("at", "bl", "iz")):
                return stem + "e"
            if len(stem) >= 2 and stem[-1] == stem[-2] and _is_consonant(stem, len(stem) - 1) \
                    and stem[-1] not in "lsz":
                return stem[:-1]
            if _measure(stem) == 1 and _ends_cvc(stem):
                return stem + "e"
            return stem
    return word


def mask(text):
    """Remove the words that selected the accessibility sample (and their variants)."""
    return MASK_RE.sub(" ", text)


def tokens(text):
    """The paper's five steps; returns the list of processed tokens."""
    out = []
    for tok in TOKEN_RE.findall(text):          # 1 tokenize, 2 drop numbers/special chars
        low = tok.lower()                        # 5 lowercase (applied here so that the
        if len(low) < MIN_TOKEN_LEN or low in STOP_WORDS:   # stop list matches "The")
            continue                             # 3 stop words
        out.append(lemmatize(low))               # 4 lemmatize
    return out


def preprocess(text):
    """Processed text as one space-joined string, as in the paper's example."""
    return " ".join(tokens(text or ""))


def duplicate_summary(df):
    """Measured facts about the duplicate groups (written to results/duplicates.csv)."""
    import pandas as pd

    sizes = df.groupby("dup_group").size()
    multi = sizes[sizes > 1].index
    m = df[df["dup_group"].isin(multi)].groupby("dup_group")
    facts = [
        ("cosine threshold (masked text, 2**18 hashed 1-2-grams)", DUPLICATE_COSINE),
        ("groups with more than one issue", len(multi)),
        ("issues in those groups", int(sizes[multi].sum())),
        ("largest group", int(sizes.max())),
        ("groups whose issues carry both labels", int((m["y"].nunique() > 1).sum())),
        ("groups spanning more than one app", int((m["repo"].nunique() > 1).sum())),
    ]
    return pd.DataFrame([(k, f"{v:g}") for k, v in facts], columns=["property", "value"])


def main(build_dir, results_dir):
    import pandas as pd

    df = pd.read_csv(build_dir / "dataset.csv", keep_default_na=False)
    df["raw"] = [preprocess(t) for t in df["body"]]
    df["masked"] = [preprocess(mask(t)) for t in df["body"]]
    # Duplicate groups are computed on the masked text: two descriptions identical up to
    # the masked words are grouped too (raw duplicates are always masked duplicates).
    df["dup_group"] = duplicate_groups(df["masked"])
    df.drop(columns=["body"]).to_csv(build_dir / "preprocessed.csv", index=False)
    duplicate_summary(df).to_csv(results_dir / "duplicates.csv", index=False)
    print(f"preprocessed {len(df)} descriptions -> {build_dir / 'preprocessed.csv'}")


if __name__ == "__main__":
    from paths import BUILD, RESULTS
    main(BUILD, RESULTS)
