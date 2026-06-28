# DeepSeek live verification

This disposable pull request verifies that the default-branch `/deepseek review` workflow can:

- accept a trusted command;
- call the configured GitHub Models DeepSeek model;
- post a review tied to the exact current head SHA;
- report whether the reviewed diff was truncated.

The pull request should be closed without merging after evidence is recorded.
