# Build and delivery

## Purpose
The repository builds a Chrome extension and an iPhone userscript, checks them in CI, and lands every change on main through a branch and a pull request. Install does not require Node when the built folders are already committed.

## Requirements

### Requirement: Local build
npm run build SHALL typecheck with no emit, then rewrite dist/ as the unpacked extension and dist-userscript/ as the userscript. Node.js 22 or newer SHALL be the development runtime. npm run dev SHALL rebuild the extension in watch mode. The built folders SHALL be safe to load without running a build.

#### Scenario: Production build
- **WHEN** a developer runs npm run build
- **THEN** typecheck runs first and both output folders are rewritten only if typecheck succeeds

### Requirement: Continuous integration
Every push and pull request SHALL run on Node 22, install with npm ci, then typecheck and test. CI SHALL NOT be required to rebuild dist/. A green run SHALL mean typecheck and tests passed.

#### Scenario: Failing test
- **WHEN** a pull request has a failing test or type error
- **THEN** the CI job fails

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
