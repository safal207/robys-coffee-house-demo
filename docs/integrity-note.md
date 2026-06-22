# Deployment integrity

The public artifact is represented by a deterministic SHA-256 manifest. Pull-request checks verify the committed files locally, and a post-deploy workflow compares the same digests with GitHub Pages.
