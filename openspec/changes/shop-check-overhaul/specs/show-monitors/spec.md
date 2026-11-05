# Spec Delta

## ADDED Requirements

### Requirement: Shop deal badges on monitored shows
When a monitored background show tab has one or more `steal` or `deal` hits in its `LiveSession.shop`, the sidepanel monitor row for that show SHALL display a shop badge naming the top steal or deal (or the count and lowest price when multiple exist) and SHALL highlight the row when a steal is present.

#### Scenario: Monitored show has a buy-it-now steal
- **WHEN** a monitored background tab has a `steal` hit for "1 oz Silver Round" at $20 in its shop scan
- **THEN** its row in "Watch other shows" displays `Shop steal: 1 oz Silver Round $20` and highlights the row

