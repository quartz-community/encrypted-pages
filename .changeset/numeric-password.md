---
"@quartz-community/encrypted-pages": patch
---

A numeric frontmatter password (`password: 1234`) now encrypts the page with its string form; previously the page was published unencrypted without a warning. A password that is neither text nor a number (a list, an object, `true`/`false`) no longer publishes the page in the clear either: the page is locked with a random key and the build warns, and the build also warns when YAML reads a password such as `0042` as a different number.
