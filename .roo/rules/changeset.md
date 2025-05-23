---
description: Guidelines for using Changesets (npm run changeset) to manage versioning and changelogs.
alwaysApply: true
---

# Changesets Workflow Guidelines

Changesets is used to manage package versioning and generate accurate `CHANGELOG.md` files automatically. It's crucial to use it correctly after making meaningful changes that affect the package from an external perspective or significantly impact internal development workflow documented elsewhere.

## When to Run Changeset

- Run `npm run changeset` (or `npx changeset add`) **after** you have staged (`git add .`) a logical set of changes that should be communicated in the next release's `CHANGELOG.md`.
- This typically includes:
    - **New Features** (Backward-compatible additions)
    - **Bug Fixes** (Fixes to existing functionality)
    - **Breaking Changes** (Changes that are not backward-compatible)
    - **Performance Improvements** (Enhancements to speed or resource usage)
    - **Significant Refactoring** (Major code restructuring, even if external behavior is unchanged, as it might affect stability or maintainability) - *Such as reorganizing the MCP server's direct function implementations into separate files*
    - **User-Facing Documentation Updates** (Changes to README, usage guides, public API docs)
    - **Dependency Updates** (Especially if they fix known issues or introduce significant changes)
    - **Build/Tooling Changes** (If they affect how consumers might build or interact with the package)
- **Every Pull Request** containing one or more of the above change types **should include a changeset file**.

## What NOT to Add a Changeset For

Avoid creating changesets for changes that have **no impact or relevance to external consumers** of the `task-master` package or contributors following **public-facing documentation**. Examples include:

- **Internal Documentation Updates:** Changes *only* to files within `.roo/rules/` that solely guide internal development practices for this specific repository.
- **Trivial Chores:** Very minor code cleanup, adding comments that don't clarify behavior, typo fixes in non-user-facing code or internal docs.
- **Non-Impactful Test Updates:** Minor refactoring of tests, adding tests for existing functionality without fixing bugs.
- **Local Configuration Changes:** Updates to personal editor settings, local `.env` files, etc.

**Rule of Thumb:** If a user installing or using the `task-master` package wouldn't care about the change, or if a contributor following the main README wouldn't need to know about it for their workflow, you likely don't need a changeset.

## How to Run and What It Asks

1.  **Run the command**:
    ```bash
    npm run changeset
    # or
    npx changeset add
    ```
2.  **Select Packages**: It will prompt you to select the package(s) affected by your changes using arrow keys and spacebar. If this is not a monorepo, select the main package.
3.  **Select Bump Type**: Choose the appropriate semantic version bump for **each** selected package:
    *   **`Major`**: For **breaking changes**. Use sparingly.
    *   **`Minor`**: For **new features**.
    *   **`Patch`**: For **bug fixes**, performance improvements, **user-facing documentation changes**, significant refactoring, relevant dependency updates, or impactful build/tooling changes.
4.  **Enter Summary**: Provide a concise summary of the changes **for the `CHANGELOG.md`**.
    *   **Purpose**: This message is user-facing and explains *what* changed in the release.
    *   **Format**: Use the imperative mood (e.g., "Add feature X", "Fix bug Y", "Update README setup instructions"). Keep it brief, typically a single line.
    *   **Audience**: Think about users installing/updating the package or developers consuming its public API/CLI.
    *   **Not a Git Commit Message**: This summary is *different* from your detailed Git commit message.

## Changeset Summary vs. Git Commit Message

- **Changeset Summary**:
    - **Audience**: Users/Consumers of the package (reads `CHANGELOG.md`).
    - **Purpose**: Briefly describe *what* changed in the released version that is relevant to them.
    - **Format**: Concise, imperative mood, single line usually sufficient.
    - **Example**: `Fix dependency resolution bug in 'next' command.`
- **Git Commit Message**:
    - **Audience**: Developers browsing the Git history of *this* repository.
    - **Purpose**: Explain *why* the change was made, the context, and the implementation details (can include internal context).
    - **Format**: Follows commit conventions (e.g., Conventional Commits), can be multi-line with a subject and body.
    - **Example**:
      ```
      fix(deps): Correct dependency lookup in 'next' command

      The logic previously failed to account for subtask dependencies when
      determining the next available task. This commit refactors the
      dependency check in `findNextTask` within `task-manager.js` to
      correctly traverse both direct and subtask dependencies. Added
      unit tests to cover this specific scenario.
      ```
- ✅ **DO**: Provide *both* a concise changeset summary (when appropriate) *and* a detailed Git commit message.
- ❌ **DON'T**: Use your detailed Git commit message body as the changeset summary.
- ❌ **DON'T**: Skip running `changeset` for user-relevant changes just because you wrote a good commit message.

## The `.changeset` File

- Running the command creates a unique markdown file in the `.changeset/` directory (e.g., `.changeset/random-name.md`).
- This file contains the bump type information and the summary you provided.
- **This file MUST be staged and committed** along with your relevant code changes.

## Standard Workflow Sequence (When a Changeset is Needed)

1.  Make your code or relevant documentation changes.
2.  Stage your changes: `git add .`
3.  Run changeset: `npm run changeset`
    *   Select package(s).
    *   Select bump type (`Patch`, `Minor`, `Major`).
    *   Enter the **concise summary** for the changelog.
4.  Stage the generated changeset file: `git add .changeset/*.md`
5.  Commit all staged changes (code + changeset file) using your **detailed Git commit message**:
    ```bash
    git commit -m "feat(module): Add new feature X..."
    ```

## Release Process (Context)

- The generated `.changeset/*.md` files are consumed later during the release process.
- Commands like `changeset version` read these files, update `package.json` versions, update the `CHANGELOG.md`, and delete the individual changeset files.
- Commands like `changeset publish` then publish the new versions to npm.

Following this workflow ensures that versioning is consistent and changelogs are automatically and accurately generated based on the contributions made.
