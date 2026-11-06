# Spec Delta

## MODIFIED Requirements

### Requirement: Punctuation is not a different prize
Titles that match once punctuation and symbols are removed SHALL share one price. A decimal, a fraction (including an ordinal fraction such as `1/10th oz`, `1/4th oz`, or `1/2nd oz`), and a slash between words SHALL stay, so "1.51 grams", "1/10 oz", "1/10th oz", and "rip/ship" do not collapse into a different prize and fractional bullion prizes melt at their fractional ounce weight.

#### Scenario: Wheat cent copied with junk characters
- **WHEN** two spots are "random (.01) Wheat cent (us mint) poor.://" and "random (.01) Wheat cent (us .mint) poor"
- **THEN** both use one price

#### Scenario: Ordinal fractional gold eagle prize
- **WHEN** a wheel prize is titled "1/10th oz Gold Eagle" and gold spot is $4,130
- **THEN** its melt value is 0.1 oz ($413) rather than 1 oz ($4,130)

