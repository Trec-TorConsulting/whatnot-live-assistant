# Spec Delta

## Purpose

On a tools show, read the battery platform, tool-only or kit, part number, and battery capacity from the listing, so that a bare tool is not valued as a kit and a want can match by part number.

## ADDED Requirements

### Requirement: Tools pass
The tools pass SHALL turn on when the show type is tools. It SHALL NOT turn on for an electronics show that lists a single drill among other devices.

#### Scenario: Milwaukee show
- **WHEN** the categories are Tools and Milwaukee Tools
- **THEN** the tools pass is on

#### Scenario: Drill on a gadget show
- **WHEN** the show type is electronics and one shop row is a cordless drill kit
- **THEN** the tools pass stays off

### Requirement: Battery platform
The pass SHALL read the battery platform from the title or description: M12, M18, M18 FUEL, Ryobi ONE+ 18V, Ryobi 40V, DeWalt 20V MAX, DeWalt FLEXVOLT, and the same kind of named platform. It SHALL NOT infer a platform from a brand alone.

#### Scenario: M18 FUEL trimmer
- **WHEN** the title is "$299 MSRP! M18 FUEL 18V 16 in. Brushless String Trimmer (Tool-Only)"
- **THEN** the platform is M18 FUEL

#### Scenario: Brand without platform
- **WHEN** the title is "Milwaukee 7 inch straight jaw pliers"
- **THEN** no platform is shown

### Requirement: Tool only or kit
The pass SHALL show tool-only when the title says tool-only or bare, or a Milwaukee part number ends in -20. It SHALL show a kit when the title says kit or names an included battery and charger, or the part number ends in -21 or -22. When neither is stated, it SHALL say the listing does not say. It SHALL NOT guess.

#### Scenario: Part number ends in -20
- **WHEN** the title or description has 2886-20
- **THEN** the quick read says tool-only

#### Scenario: Ratchet kit
- **WHEN** the title is "2457-21 3/8-in Cordless M12 Lithium-Ion Ratchet Kit"
- **THEN** the quick read says kit

#### Scenario: Not stated
- **WHEN** the lot is "Milwaukee M12 Fuel Hammer Drill #3" with no part number and no kit wording
- **THEN** the quick read says the listing does not say tool-only or kit

### Requirement: Part number
The pass SHALL read a manufacturer part number from the title or the listing description, such as 48-11-2425, 2738-20, or DMAPL9910-S7. It SHALL show it in the quick read. A seller stock code such as K135 SHALL NOT be shown as a part number.

#### Scenario: Number only in the description
- **WHEN** the title is a string trimmer and the description is 3046-20
- **THEN** the quick read shows 3046-20

#### Scenario: Stock code
- **WHEN** the description is K135
- **THEN** no part number is shown from it

### Requirement: Battery capacity
The pass SHALL read battery amp-hours (2.5Ah, 3.0, CP High Output 2.5) from a battery or kit listing and SHALL show it. It SHALL NOT invent a capacity.

#### Scenario: M12 battery and charger
- **WHEN** the title is "MSRP $148 Milwaukee M12 3.0 battery And M12 Charger"
- **THEN** the quick read shows M12, 3.0 Ah, and a charger

### Requirement: Tools quick read
On the tools pass, the Live panel and the on-page overlay SHALL show platform, tool-only or kit, part number, capacity, start, and shipping as soon as the listing is known, before any model call.

#### Scenario: Listing before the model
- **WHEN** the active lot is "$329 M18 FUEL 5 in. Flathead Braking Grinder 2886-20" and no appraisal has returned
- **THEN** the quick read shows M18 FUEL, tool-only, and 2886-20

### Requirement: Tool wants
On the tools pass, a buyer line that names a part number, or a platform with a tool, SHALL be kept as a want and SHALL highlight a later lot or shop row with that part number, or that platform and tool word. It SHALL NOT send chat.

#### Scenario: Part number ask
- **WHEN** a buyer writes "3049-20?" and a later shop row has 3049-20
- **THEN** that row is highlighted and no chat is sent

#### Scenario: Platform and tool
- **WHEN** a buyer writes "M18 sawzall?" and a later lot is an M18 SAWZALL
- **THEN** that lot is highlighted
