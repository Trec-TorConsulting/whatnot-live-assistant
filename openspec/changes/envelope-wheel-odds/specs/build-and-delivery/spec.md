# Spec Delta

## ADDED Requirements

### Requirement: Version bump
A change to extension code, assets, or config SHALL bump the version in package.json once. The bump SHALL be a patch unless a feature bump was requested. The built manifest and the userscript SHALL show that same version.

#### Scenario: Patch change
- **WHEN** extension code changes and no feature bump was requested
- **THEN** the package.json patch version increases once and the built manifest and userscript show that version
