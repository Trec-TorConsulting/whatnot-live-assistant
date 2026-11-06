# Build and delivery

## Purpose
The repository builds a Chrome extension and an iPhone userscript, checks them in CI, detects selector regressions via canary smoke tests, publishes release archives on git tags, and lands every change on main through a branch and a pull request. Install does not require Node when the built folders are already committed.

## Requirements

### Requirement: Local build
npm run build SHALL typecheck with no emit, then rewrite dist/ as the unpacked extension and dist-userscript/ as the userscript. Node.js 22 or newer SHALL be the development runtime. npm run dev SHALL rebuild the extension in watch mode. The built folders SHALL be safe to load without running a build.

#### Scenario: Production build
- **WHEN** a developer runs npm run build
- **THEN** typecheck runs first and both output folders are rewritten only if typecheck succeeds

### Requirement: Continuous integration and canary testing
Every push and pull request SHALL run on Node 22, install with npm ci, then typecheck and test. CI SHALL NOT be required to rebuild dist/. A green run SHALL mean typecheck and tests passed.
A scheduled canary workflow SHALL run against production Whatnot pages and SHALL verify that core DOM selectors match valid elements without user action.

#### Scenario: Failing test
- **WHEN** a pull request has a failing test or type error
- **THEN** the CI job fails

#### Scenario: Canary selector regression
- **WHEN** the scheduled canary detects that Whatnot changed the live auction or chat DOM structure
- **THEN** the workflow fails and opens a diagnostic issue reporting the broken selector keys

### Requirement: Tagged release packaging
When a git tag matching `v*` is pushed, a release workflow SHALL build the extension, package the contents of `dist/` into a compressed archive named `whatnot-assistant-{version}.zip`, calculate its SHA-256 checksum, and attach the archive to a GitHub Release.

#### Scenario: Publishing a version tag
- **WHEN** a tag `v0.24.0` is pushed to GitHub
- **THEN** the release workflow builds the project and uploads `whatnot-assistant-0.24.0.zip` with a checksum file to the release

### Requirement: Branch and pull request
Every change SHALL be committed on its own branch and opened as a pull request into main. Work SHALL NOT be committed directly to main. Tokens, .env files, and Chrome profiles SHALL NOT be committed.

#### Scenario: Ready to merge
- **WHEN** a change is ready for main
- **THEN** it is on a branch with an open pull request into main

### Requirement: Secrets stay out of the tree
The repository SHALL NOT contain API keys, a Whatnot login, or a bid. Keys the user adds in Settings SHALL stay in that browser profile.

#### Scenario: Fresh clone
- **WHEN** someone clones the repository
- **THEN** they can load the extension and no API key is present in the tree

### Requirement: Version bump
A change to extension code, assets, or config SHALL bump the version in package.json once. The bump SHALL be a patch unless a feature bump was requested. The built manifest and the userscript SHALL show that same version.

#### Scenario: Patch change
- **WHEN** extension code changes and no feature bump was requested
- **THEN** the package.json patch version increases once and the built manifest and userscript show that version

