"""Email redaction for issue titles and bodies (deterministic, idempotent, bounded).

Every email-shaped string in a title or body is put in exactly one category:

  not_address  - a file or asset name that only looks like an address (icon@2x.png)
  code         - inside inline backticks or a fenced code block (``` or ~~~), unless the
                 domain is a free-mail provider (then it is a person's address: contact)
  identifier   - a browser add-on ID in a pasted extension list (Firefox add-on IDs are
                 often written like addresses, e.g. "webcompat@mozilla.org"): the 300
                 characters before it mention an extension or add-on, its line does not
                 mention mail or contact, and its domain is not a free-mail provider
  placeholder  - an example or template address (example.com/.org/.net, *.invalid,
                 user@domain.com and similar)
  role         - a role, service or no-reply address (*@users.noreply.github.com, cloud
                 service accounts *.gserviceaccount.com,
                 noreply@, support@, team@, git@github.com, ...)
  contact      - anything else: a real contact address

Only `contact` matches are replaced, each with REDACTED. Everything else is kept as written.
REDACTED contains no "@", so running the redaction again changes nothing.
"""
import re

REDACTED = "[email redacted]"

# Bounded: the local part and every domain label have a fixed maximum length, and the
# top-level domain must be letters, so the scan is linear and never backtracks badly.
EMAIL_RE = re.compile(
    r"(?<![A-Za-z0-9._%+-])"
    r"[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.){1,8}[A-Za-z]{2,24}"
    r"(?![A-Za-z0-9-])")

FENCE_RE = re.compile(r"^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n.*?(?:^[ \t]{0,3}\1[ \t]*$|\Z)",
                      re.MULTILINE | re.DOTALL)
INLINE_CODE_RE = re.compile(r"(`+)(?!`)[^\n]*?(?<!`)\1(?!`)")

FILE_TLDS = {"png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "aar", "jar", "apk",
             "aab", "so", "js", "mjs", "ts", "json", "xml", "kt", "java", "html", "css", "md",
             "txt", "zip", "gz", "ttf", "otf", "woff", "woff2", "mp3", "mp4", "webm", "pdf",
             "gradle", "kts", "yml", "yaml", "log"}
PLACEHOLDER_DOMAINS = {"example.com", "example.org", "example.net", "domain.com", "domain.tld",
                       "yourdomain.com", "mydomain.com", "your-domain.com", "somedomain.com",
                       "company.com", "yourcompany.com", "host.com", "server.com", "foo.com",
                       "bar.com", "foobar.com", "test.com"}
PLACEHOLDER_SUFFIXES = (".invalid", ".example", ".test", ".localhost", ".example.com",
                        ".example.org", ".example.net")
PLACEHOLDER_LOCALS = {"user", "username", "name", "you", "your", "yourname", "your.name",
                      "your-email", "youremail", "email", "e-mail", "mail", "me", "foo",
                      "foobar", "test", "someone", "somebody", "john.doe", "jane.doe",
                      "johndoe", "janedoe", "firstname.lastname", "first.last", "abc",
                      "address", "x", "xx", "xxx", "xxxx"}
ROLE_DOMAIN_SUFFIXES = ("noreply.github.com", ".gserviceaccount.com")
ROLE_LOCALS = {"support", "help", "info", "feedback", "accessibility", "a11y", "security",
               "privacy", "team", "contact", "hello", "bugs", "bug", "dev", "devs",
               "developers", "admin", "webmaster", "abuse", "legal", "press", "android",
               "apps", "app", "mobile", "git", "noreply", "no-reply", "donotreply",
               "do-not-reply", "notifications", "mailer-daemon", "postmaster", "beta",
               "translations", "translate", "office", "sales", "community", "dpo"}
ROLE_PREFIXES = ("noreply", "no-reply", "donotreply", "do-not-reply")

FREE_MAIL = {"gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com",
             "live.com", "icloud.com", "me.com", "aol.com", "gmx.de", "gmx.net", "web.de",
             "proton.me", "protonmail.com", "mail.ru", "yandex.ru", "yandex.com", "qq.com",
             "163.com", "posteo.de", "tutanota.com", "mailbox.org"}
ADDON_CONTEXT_RE = re.compile(r"extension|add-?ons?\b", re.IGNORECASE)
MAIL_WORD_RE = re.compile(r"mail|contact", re.IGNORECASE)
CONTEXT = 300

CATEGORIES = ("not_address", "code", "identifier", "placeholder", "role", "contact")


def _code_spans(text):
    spans = [m.span() for m in FENCE_RE.finditer(text)]
    for m in INLINE_CODE_RE.finditer(text):
        if not any(a <= m.start() < b for a, b in spans):
            spans.append(m.span())
    return spans


def _addon_list(text, start, domain):
    """True if the match at `start` sits in a pasted extension / add-on list."""
    if domain in FREE_MAIL:
        return False
    line_start = text.rfind("\n", 0, start) + 1
    return (bool(ADDON_CONTEXT_RE.search(text, max(0, start - CONTEXT), start))
            and not MAIL_WORD_RE.search(text, line_start, start))


def category(address, in_code=False, in_addon_list=False):
    """The category of one email-shaped string (see the module docstring)."""
    local, _, domain = address.lower().rpartition("@")
    if domain.rsplit(".", 1)[-1] in FILE_TLDS:
        return "not_address"
    if in_code:
        return "contact" if domain in FREE_MAIL else "code"
    if in_addon_list and domain not in FREE_MAIL:
        return "identifier"
    if (domain in PLACEHOLDER_DOMAINS or domain.endswith(PLACEHOLDER_SUFFIXES)
            or local in PLACEHOLDER_LOCALS and domain.split(".")[0] in {"gmail", "email", "mail", "domain"}):
        return "placeholder"
    if (domain.endswith(ROLE_DOMAIN_SUFFIXES) or local in ROLE_LOCALS
            or local.startswith(ROLE_PREFIXES)):
        return "role"
    return "contact"


def classify(text):
    """List of (start, end, category) for every email-shaped match in text."""
    if not text or "@" not in text:
        return []
    spans = _code_spans(text) if "`" in text or "~~~" in text else []
    out = []
    for m in EMAIL_RE.finditer(text):
        domain = m.group().lower().rpartition("@")[2]
        out.append((m.start(), m.end(), category(
            m.group(), any(a <= m.start() < b for a, b in spans),
            _addon_list(text, m.start(), domain))))
    return out


def redact(text):
    """text with every contact address replaced by REDACTED; other matches unchanged."""
    hits = [(a, b) for a, b, cat in classify(text) if cat == "contact"]
    for a, b in reversed(hits):
        text = text[:a] + REDACTED + text[b:]
    return text


def redact_item(item):
    """Copy of one search result with contact addresses removed from its title and body."""
    out = dict(item)
    for key in ("title", "body"):
        if isinstance(out.get(key), str):
            out[key] = redact(out[key])
    return out
